from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.deps import CurrentWebUser, get_current_web_user, get_session, get_settings
from app.dispatch import (
    ATTRIBUTION_REASONS,
    build_daily_brief,
    bump_mold_counter,
    create_dispatch_point,
    ledger_stats,
    push_brief_to_bound_groups,
    reconcile_work_orders,
    record_actual,
    record_machine_actual,
    reset_mold_counter,
    suggest_assignees,
    zone_occupancy_summary,
)
from app.models import (
    DecisionPointRecord,
    MoldMaintenanceRuleRecord,
    SemanticZoneRecord,
    ShiftRosterEntryRecord,
    SkillMatrixEntryRecord,
    utc_now,
)
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access

router = APIRouter(tags=["decision-ledger"])


def _day_start(value: date_type) -> datetime:
    return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)


def _serialize_point(point: DecisionPointRecord) -> dict:
    return {
        "decisionPointId": point.id,
        "organizationId": point.organization_id,
        "domain": point.domain,
        "eventType": point.event_type,
        "source": point.source,
        "subjectRef": point.subject_ref,
        "occurredAt": point.occurred_at,
        "plan": point.plan_json,
        "prediction": point.prediction_json,
        "predictedAt": point.predicted_at,
        "actual": point.actual_json,
        "actualRecordedAt": point.actual_recorded_at,
        "consistent": point.consistent,
        "attribution": point.attribution,
        "attributionNote": point.attribution_note,
        "attributedBy": point.attributed_by,
        "attributedAt": point.attributed_at,
        "status": point.status,
        "createdAt": point.created_at,
    }


# ---------------------------------------------------------------------------
# Decision points
# ---------------------------------------------------------------------------


class CreateDispatchPointRequestDto(BaseModel):
    organizationId: str
    machineNo: str = Field(min_length=1, max_length=80)
    occurredAt: datetime
    source: str = Field(default="manual", max_length=40)
    actualAssignee: str | None = Field(default=None, max_length=80)
    plan: dict = Field(default_factory=dict)


@router.get("/v1/decision-points")
def list_decision_points(
    organizationId: str | None = None,
    eventType: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    consistentOnly: bool | None = Query(default=None),
    mismatchOnly: bool = Query(default=False),
    unattributedOnly: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    statement = apply_org_read_scope(
        select(DecisionPointRecord), DecisionPointRecord.organization_id, current_user
    )
    if organizationId:
        ensure_org_read_access(session, current_user, organizationId, action="decision_ledger.read")
        statement = statement.where(DecisionPointRecord.organization_id == organizationId)
    if eventType:
        statement = statement.where(DecisionPointRecord.event_type == eventType)
    if status_filter:
        statement = statement.where(DecisionPointRecord.status == status_filter)
    if consistentOnly is True:
        statement = statement.where(DecisionPointRecord.consistent == True)  # noqa: E712
    if mismatchOnly:
        statement = statement.where(DecisionPointRecord.consistent == False)  # noqa: E712
    if unattributedOnly:
        statement = statement.where(DecisionPointRecord.attribution == "none")
    statement = statement.order_by(DecisionPointRecord.occurred_at.desc()).limit(limit)
    points = session.exec(statement).all()
    return {"decisionPoints": [_serialize_point(point) for point in points]}


@router.get("/v1/decision-points/stats")
def get_ledger_stats(
    organizationId: str,
    days: int = Query(default=14, ge=1, le=90),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_read_access(session, current_user, organizationId, action="decision_ledger.read")
    return ledger_stats(session, organization_id=organizationId, days=days)


@router.post("/v1/decision-points/dispatch")
def create_dispatch_decision_point(
    request: CreateDispatchPointRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_write_access(session, current_user, request.organizationId, action="decision_ledger.write")
    point = create_dispatch_point(
        session,
        organization_id=request.organizationId,
        site_id=None,
        machine_no=request.machineNo,
        occurred_at=request.occurredAt,
        source=request.source,
        plan=request.plan,
        actual_assignee=request.actualAssignee,
    )
    session.commit()
    session.refresh(point)
    return _serialize_point(point)


class RecordActualRequestDto(BaseModel):
    actual: dict = Field(default_factory=dict)


@router.post("/v1/decision-points/{point_id}/actual")
def record_decision_actual(
    point_id: str,
    request: RecordActualRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    point = session.get(DecisionPointRecord, point_id)
    if point is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="decision point not found")
    ensure_org_write_access(session, current_user, point.organization_id, action="decision_ledger.write")
    record_actual(session, point, request.actual)
    session.commit()
    session.refresh(point)
    return _serialize_point(point)


class AttributionRequestDto(BaseModel):
    attribution: str
    note: str | None = Field(default=None, max_length=2000)


@router.post("/v1/decision-points/{point_id}/attribution")
def attribute_decision_point(
    point_id: str,
    request: AttributionRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    if request.attribution not in ATTRIBUTION_REASONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"attribution must be one of {sorted(ATTRIBUTION_REASONS)}",
        )
    point = session.get(DecisionPointRecord, point_id)
    if point is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="decision point not found")
    ensure_org_write_access(session, current_user, point.organization_id, action="decision_ledger.write")
    point.attribution = request.attribution
    point.attribution_note = request.note
    point.attributed_by = current_user.user.display_name
    point.attributed_at = utc_now()
    point.updated_at = utc_now()
    session.add(point)
    session.commit()
    session.refresh(point)
    return _serialize_point(point)


# ---------------------------------------------------------------------------
# Reconciliation + daily brief
# ---------------------------------------------------------------------------


@router.post("/v1/decision-ledger/reconcile-work-orders")
def reconcile_work_orders_endpoint(
    organizationId: str,
    date: date_type = Query(...),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_write_access(session, current_user, organizationId, action="decision_ledger.write")
    created = reconcile_work_orders(
        session, organization_id=organizationId, target_date=_day_start(date)
    )
    session.commit()
    return {"createdCount": len(created), "date": date.isoformat()}


@router.get("/v1/decision-ledger/daily-brief")
def get_daily_brief(
    organizationId: str,
    date: date_type = Query(...),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_read_access(session, current_user, organizationId, action="decision_ledger.read")
    text = build_daily_brief(session, organization_id=organizationId, target_date=_day_start(date))
    return {"text": text}


@router.post("/v1/decision-ledger/daily-brief/line-push")
def push_daily_brief(
    organizationId: str,
    date: date_type = Query(...),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> dict:
    ensure_org_write_access(session, current_user, organizationId, action="decision_ledger.write")
    text = build_daily_brief(session, organization_id=organizationId, target_date=_day_start(date))
    sent = push_brief_to_bound_groups(
        session,
        settings,
        organization_id=organizationId,
        target_date=_day_start(date),
    )
    session.commit()
    return {"sentGroups": sent, "text": text}


# ---------------------------------------------------------------------------
# Dispatch config: roster / skills / zones / mold rules
# ---------------------------------------------------------------------------


class RosterEntryDto(BaseModel):
    personName: str = Field(min_length=1, max_length=80)
    shift: str = Field(default="day", pattern="^(day|night|full)$")
    zoneName: str | None = Field(default=None, max_length=80)
    machineNos: list[str] = Field(default_factory=list, max_length=30)


class PutRosterRequestDto(BaseModel):
    organizationId: str
    workDate: date_type
    entries: list[RosterEntryDto] = Field(default_factory=list, max_length=100)


@router.put("/v1/dispatch-config/roster")
def put_roster(
    request: PutRosterRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_write_access(session, current_user, request.organizationId, action="dispatch_config.write")
    work_date = request.workDate.isoformat()
    existing = session.exec(
        select(ShiftRosterEntryRecord).where(
            ShiftRosterEntryRecord.organization_id == request.organizationId,
            ShiftRosterEntryRecord.work_date == work_date,
        )
    ).all()
    for row in existing:
        session.delete(row)
    for entry in request.entries:
        session.add(
            ShiftRosterEntryRecord(
                organization_id=request.organizationId,
                work_date=work_date,
                shift=entry.shift,
                person_name=entry.personName.strip(),
                zone_name=entry.zoneName.strip() if entry.zoneName else None,
                machine_nos_json=[m.strip() for m in entry.machineNos if m.strip()],
            )
        )
    session.commit()
    return {"workDate": work_date, "entryCount": len(request.entries)}


@router.get("/v1/dispatch-config/roster")
def get_roster(
    organizationId: str,
    date: date_type = Query(...),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_read_access(session, current_user, organizationId, action="dispatch_config.read")
    rows = session.exec(
        select(ShiftRosterEntryRecord).where(
            ShiftRosterEntryRecord.organization_id == organizationId,
            ShiftRosterEntryRecord.work_date == date.isoformat(),
        )
    ).all()
    return {
        "workDate": date.isoformat(),
        "entries": [
            {
                "personName": row.person_name,
                "shift": row.shift,
                "zoneName": row.zone_name,
                "machineNos": row.machine_nos_json,
            }
            for row in rows
        ],
    }


class SkillEntryDto(BaseModel):
    personName: str = Field(min_length=1, max_length=80)
    machineNo: str = Field(min_length=1, max_length=80)
    level: int = Field(default=1, ge=0, le=3)


class PutSkillMatrixRequestDto(BaseModel):
    organizationId: str
    entries: list[SkillEntryDto] = Field(default_factory=list, max_length=500)


@router.put("/v1/dispatch-config/skill-matrix")
def put_skill_matrix(
    request: PutSkillMatrixRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_write_access(session, current_user, request.organizationId, action="dispatch_config.write")
    for entry in request.entries:
        person = entry.personName.strip()
        machine = entry.machineNo.strip()
        row = session.exec(
            select(SkillMatrixEntryRecord).where(
                SkillMatrixEntryRecord.organization_id == request.organizationId,
                SkillMatrixEntryRecord.person_name == person,
                SkillMatrixEntryRecord.machine_no == machine,
            )
        ).first()
        if entry.level == 0:
            if row is not None:
                session.delete(row)
            continue
        if row is None:
            row = SkillMatrixEntryRecord(
                organization_id=request.organizationId,
                person_name=person,
                machine_no=machine,
                level=entry.level,
            )
        else:
            row.level = entry.level
            row.updated_at = utc_now()
        session.add(row)
    session.commit()
    return {"entryCount": len(request.entries)}


@router.get("/v1/dispatch-config/skill-matrix")
def get_skill_matrix(
    organizationId: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_read_access(session, current_user, organizationId, action="dispatch_config.read")
    rows = session.exec(
        select(SkillMatrixEntryRecord).where(
            SkillMatrixEntryRecord.organization_id == organizationId
        )
    ).all()
    return {
        "entries": [
            {"personName": row.person_name, "machineNo": row.machine_no, "level": row.level}
            for row in rows
        ]
    }


class ZoneDto(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    xMin: float
    xMax: float
    zMin: float
    zMax: float
    machineNos: list[str] = Field(default_factory=list, max_length=30)


class PutZonesRequestDto(BaseModel):
    organizationId: str
    zones: list[ZoneDto] = Field(default_factory=list, max_length=50)


@router.put("/v1/dispatch-config/zones")
def put_zones(
    request: PutZonesRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_write_access(session, current_user, request.organizationId, action="dispatch_config.write")
    existing = session.exec(
        select(SemanticZoneRecord).where(
            SemanticZoneRecord.organization_id == request.organizationId
        )
    ).all()
    for row in existing:
        session.delete(row)
    for zone in request.zones:
        session.add(
            SemanticZoneRecord(
                organization_id=request.organizationId,
                name=zone.name.strip(),
                x_min=min(zone.xMin, zone.xMax),
                x_max=max(zone.xMin, zone.xMax),
                z_min=min(zone.zMin, zone.zMax),
                z_max=max(zone.zMin, zone.zMax),
                machine_nos_json=[m.strip() for m in zone.machineNos if m.strip()],
            )
        )
    session.commit()
    return {"zoneCount": len(request.zones)}


class MoldRuleDto(BaseModel):
    moldNo: str = Field(min_length=1, max_length=80)
    thresholdCount: int = Field(ge=1)
    counterSource: str = Field(default="manual", max_length=80)


class PutMoldRulesRequestDto(BaseModel):
    organizationId: str
    rules: list[MoldRuleDto] = Field(default_factory=list, max_length=100)


@router.put("/v1/dispatch-config/mold-rules")
def put_mold_rules(
    request: PutMoldRulesRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_write_access(session, current_user, request.organizationId, action="dispatch_config.write")
    for rule_dto in request.rules:
        mold_no = rule_dto.moldNo.strip()
        rule = session.exec(
            select(MoldMaintenanceRuleRecord).where(
                MoldMaintenanceRuleRecord.organization_id == request.organizationId,
                MoldMaintenanceRuleRecord.mold_no == mold_no,
            )
        ).first()
        if rule is None:
            rule = MoldMaintenanceRuleRecord(
                organization_id=request.organizationId,
                mold_no=mold_no,
                threshold_count=rule_dto.thresholdCount,
                counter_source=rule_dto.counterSource,
            )
        else:
            rule.threshold_count = rule_dto.thresholdCount
            rule.counter_source = rule_dto.counterSource
            rule.is_active = True
            rule.updated_at = utc_now()
        session.add(rule)
    session.commit()
    return {"ruleCount": len(request.rules)}


class MoldCounterRequestDto(BaseModel):
    organizationId: str
    moldNo: str = Field(min_length=1, max_length=80)
    setCount: int | None = Field(default=None, ge=0)
    increment: int | None = Field(default=None)


@router.post("/v1/dispatch-config/mold-counter")
def post_mold_counter(
    request: MoldCounterRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> dict:
    ensure_org_write_access(session, current_user, request.organizationId, action="dispatch_config.write")
    rule, alerted = bump_mold_counter(
        session,
        settings,
        organization_id=request.organizationId,
        mold_no=request.moldNo,
        set_count=request.setCount,
        increment=request.increment,
    )
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mold rule not found")
    session.commit()
    return {"moldNo": rule.mold_no, "currentCount": rule.current_count, "alerted": alerted}


# ---------------------------------------------------------------------------
# Suggestion preview + zone occupancy
# ---------------------------------------------------------------------------


@router.get("/v1/dispatch/suggestions")
def preview_suggestions(
    organizationId: str,
    machineNo: str,
    occurredAt: datetime | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_read_access(session, current_user, organizationId, action="decision_ledger.read")
    candidates = suggest_assignees(
        session,
        organization_id=organizationId,
        machine_no=machineNo,
        occurred_at=occurredAt or utc_now(),
    )
    return {"machineNo": machineNo, "candidates": candidates}


@router.get("/v1/zone-occupancy/summary")
def get_zone_occupancy_summary(
    organizationId: str,
    start: datetime = Query(...),
    end: datetime = Query(...),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_read_access(session, current_user, organizationId, action="decision_ledger.read")
    if end <= start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end must be after start")
    return zone_occupancy_summary(session, organization_id=organizationId, start=start, end=end)
