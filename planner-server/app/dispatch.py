from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.line_bot import LineBotDeliveryError, line_is_configured, push_line_message
from app.models import (
    CameraDevice,
    CameraOcrObservation,
    CameraPersonObservation,
    DecisionPointRecord,
    LineGroupBinding,
    MoldMaintenanceRuleRecord,
    SemanticZoneRecord,
    ShiftRosterEntryRecord,
    SkillMatrixEntryRecord,
    utc_now,
)

logger = logging.getLogger(__name__)

ATTRIBUTION_REASONS = {
    "none",
    "rule_wrong",
    "data_missing",
    "schedule_gap",
    "skill_matrix_stale",
    "implicit_rule",
    "foreman_preference",
    "site_exception",
    "other",
}

DECISION_EVENT_TYPES = {"dispatch", "plan_vs_actual", "anomaly_response", "maintenance"}

# Rows of the dispatch sheet that carry planned quantities, in publish order.
_WORK_ORDER_QUANTITY_KEYS = (
    "plannedWithHanger",
    "plannedScheduledNoHanger",
    "plannedNoHanger",
    "total",
)


SITE_TZ = timezone(timedelta(hours=8))  # Taiwan factory local time
SITE_TZ_NAME = "Asia/Taipei"


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _site_day_window(target_date: datetime) -> tuple[datetime, datetime, datetime]:
    local_day = _as_utc(target_date).astimezone(SITE_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    day_start = local_day.astimezone(timezone.utc)
    return day_start, day_start + timedelta(days=1), local_day


# ---------------------------------------------------------------------------
# Suggestion engine v0 (pure rules: roster x skill matrix x zone occupancy)
# ---------------------------------------------------------------------------


def _shift_for_hour(hour: int) -> str:
    return "day" if 8 <= hour < 20 else "night"


def suggest_assignees(
    session: Session,
    *,
    organization_id: str,
    machine_no: str,
    occurred_at: datetime,
    limit: int = 2,
) -> list[dict]:
    """Rank candidate assignees for a machine event.

    Score = on-shift (required) + skill level on the machine + zone hint.
    Zone hint uses roster zone_name only; camera occupancy is anonymous, so it
    can support but never identify (kept honest for G2).
    """

    occurred_at = _as_utc(occurred_at)
    local_dt = occurred_at.astimezone(SITE_TZ)
    work_date = local_dt.date().isoformat()
    shift = _shift_for_hour(local_dt.hour)
    roster_rows = session.exec(
        select(ShiftRosterEntryRecord).where(
            ShiftRosterEntryRecord.organization_id == organization_id,
            ShiftRosterEntryRecord.work_date == work_date,
        )
    ).all()
    on_shift = [row for row in roster_rows if row.shift in (shift, "full")]
    if not on_shift:
        return []

    skills = session.exec(
        select(SkillMatrixEntryRecord).where(
            SkillMatrixEntryRecord.organization_id == organization_id,
            SkillMatrixEntryRecord.machine_no == machine_no,
        )
    ).all()
    skill_by_person = {row.person_name: row.level for row in skills}

    machine_zone = _zone_name_for_machine(session, organization_id, machine_no)

    candidates: list[dict] = []
    for row in on_shift:
        score = 0.0
        rationale: list[str] = [f"{row.shift} 班在班"]
        level = skill_by_person.get(row.person_name)
        if level:
            score += 10.0 * level
            rationale.append(f"會 {machine_no}(等級 {level})")
        elif machine_no in (row.machine_nos_json or []):
            score += 8.0
            rationale.append(f"排班表列 {machine_no}")
        else:
            # Unskilled candidates rank last but stay visible for attribution.
            rationale.append(f"技能表無 {machine_no} 紀錄")
        if machine_zone and row.zone_name == machine_zone:
            score += 3.0
            rationale.append(f"駐 {machine_zone} 區")
        candidates.append(
            {
                "name": row.person_name,
                "score": round(score, 2),
                "rationale": "、".join(rationale),
            }
        )
    candidates.sort(key=lambda item: (-item["score"], item["name"]))
    return candidates[:limit]


def _zone_name_for_machine(session: Session, organization_id: str, machine_no: str) -> str | None:
    zones = session.exec(
        select(SemanticZoneRecord).where(
            SemanticZoneRecord.organization_id == organization_id,
            SemanticZoneRecord.is_active == True,  # noqa: E712
        )
    ).all()
    for zone in zones:
        if machine_no in (zone.machine_nos_json or []):
            return zone.name
    return None


# ---------------------------------------------------------------------------
# Decision ledger helpers
# ---------------------------------------------------------------------------


def compute_consistency(point: DecisionPointRecord) -> bool | None:
    predicted = [str(p.get("name")) for p in point.prediction_json.get("candidates", []) if p.get("name")]
    actual_assignee = point.actual_json.get("assignee")
    if point.event_type == "dispatch":
        if not predicted or not actual_assignee:
            return None
        return str(actual_assignee) in predicted
    if point.event_type == "plan_vs_actual":
        planned = point.plan_json.get("plannedTotal")
        actual = point.actual_json.get("actualTotal")
        if planned in (None, "unknown") or actual in (None, "unknown"):
            return None
        try:
            planned_f = float(planned)
            actual_f = float(actual)
        except (TypeError, ValueError):
            return None
        if planned_f <= 0:
            return None
        tolerance = float(point.plan_json.get("tolerance", 0.05))
        return abs(actual_f - planned_f) / planned_f <= tolerance
    return None


def record_actual(
    session: Session,
    point: DecisionPointRecord,
    actual: dict,
    *,
    recorded_at: datetime | None = None,
) -> DecisionPointRecord:
    point.actual_json = {**point.actual_json, **actual}
    point.actual_recorded_at = recorded_at or utc_now()
    point.consistent = compute_consistency(point)
    point.status = "resolved"
    point.updated_at = utc_now()
    session.add(point)
    return point


def create_dispatch_point(
    session: Session,
    *,
    organization_id: str,
    site_id: str | None,
    machine_no: str,
    occurred_at: datetime,
    source: str,
    plan: dict | None = None,
    actual_assignee: str | None = None,
) -> DecisionPointRecord:
    """Shadow mode: prediction is written BEFORE the actual is recorded."""

    candidates = suggest_assignees(
        session,
        organization_id=organization_id,
        machine_no=machine_no,
        occurred_at=occurred_at,
    )
    point = DecisionPointRecord(
        organization_id=organization_id,
        site_id=site_id,
        event_type="dispatch",
        source=source,
        subject_ref=machine_no,
        occurred_at=_as_utc(occurred_at),
        plan_json=plan or {},
        prediction_json={"engine": "rules_v0", "candidates": candidates},
        predicted_at=utc_now(),
    )
    if actual_assignee:
        record_actual(session, point, {"assignee": actual_assignee})
    session.add(point)
    return point


# ---------------------------------------------------------------------------
# Work-order reconciliation (#1 plan-vs-actual hub)
# ---------------------------------------------------------------------------


def _quantity_value(work_order: dict, key: str) -> int | None:
    row = (work_order.get("quantities") or {}).get(key) or {}
    for cell in ("left", "right"):
        value = (row.get(cell) or {}).get("value")
        if isinstance(value, (int, float)):
            return int(value)
    return None


def reconcile_work_orders(
    session: Session,
    *,
    organization_id: str,
    target_date: datetime,
) -> list[DecisionPointRecord]:
    """Turn today's stabilized dispatch sheets into plan_vs_actual points.

    Idempotent per (machine, date): reruns update plan instead of duplicating.
    """

    target_date = _as_utc(target_date)
    day_start = target_date.astimezone(SITE_TZ).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)
    cameras = session.exec(
        select(CameraDevice).where(CameraDevice.organization_id == organization_id)
    ).all()
    created: list[DecisionPointRecord] = []
    for camera in cameras:
        observation = session.exec(
            select(CameraOcrObservation)
            .where(
                CameraOcrObservation.camera_id == camera.id,
                CameraOcrObservation.captured_at >= day_start,
                CameraOcrObservation.captured_at < day_end,
            )
            .order_by(CameraOcrObservation.captured_at.desc())
        ).first()
        if observation is None:
            continue
        work_order = (observation.structured_fields_json or {}).get("workOrder") or {}
        if not work_order:
            continue
        machine_field = (work_order.get("fields") or {}).get("machineNo") or {}
        machine_no = machine_field.get("value")
        if not machine_no or machine_no == "unknown":
            continue
        mold_field = (work_order.get("fields") or {}).get("moldNo") or {}
        planned_total = _quantity_value(work_order, "total")
        plan = {
            "plannedTotal": planned_total,
            "plannedRows": {key: _quantity_value(work_order, key) for key in _WORK_ORDER_QUANTITY_KEYS},
            "moldNo": mold_field.get("value"),
            "stabilized": bool(work_order.get("stabilized")),
            "cameraId": camera.id,
            "workDate": day_start.date().isoformat(),
        }
        existing = session.exec(
            select(DecisionPointRecord).where(
                DecisionPointRecord.organization_id == organization_id,
                DecisionPointRecord.event_type == "plan_vs_actual",
                DecisionPointRecord.subject_ref == str(machine_no),
                DecisionPointRecord.occurred_at >= day_start,
                DecisionPointRecord.occurred_at < day_end,
            )
        ).first()
        if existing is not None:
            existing.plan_json = {**existing.plan_json, **plan}
            existing.updated_at = utc_now()
            session.add(existing)
            continue
        point = DecisionPointRecord(
            organization_id=organization_id,
            site_id=camera.site_id,
            event_type="plan_vs_actual",
            source="work_order",
            subject_ref=str(machine_no),
            occurred_at=day_start,
            plan_json=plan,
        )
        session.add(point)
        created.append(point)
    return created


def record_machine_actual(
    session: Session,
    *,
    organization_id: str,
    machine_no: str,
    actual_total: int,
    reported_by: str,
    reported_at: datetime | None = None,
) -> DecisionPointRecord | None:
    """LINE「回報 <機台> 數量 <N>」 fills today's plan_vs_actual point."""

    now = reported_at or utc_now()
    local_midnight = _as_utc(now).astimezone(SITE_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    day_start = local_midnight.astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)
    point = session.exec(
        select(DecisionPointRecord)
        .where(
            DecisionPointRecord.organization_id == organization_id,
            DecisionPointRecord.event_type == "plan_vs_actual",
            DecisionPointRecord.subject_ref == machine_no,
            DecisionPointRecord.occurred_at >= day_start,
            DecisionPointRecord.occurred_at < day_end,
        )
        .order_by(DecisionPointRecord.occurred_at.desc())
    ).first()
    if point is None:
        return None
    record_actual(
        session,
        point,
        {"actualTotal": actual_total, "reportedBy": reported_by, "channel": "line"},
        recorded_at=now,
    )
    return point


# ---------------------------------------------------------------------------
# Ledger stats + daily brief
# ---------------------------------------------------------------------------


def ledger_stats(session: Session, *, organization_id: str, days: int = 14) -> dict:
    since = utc_now() - timedelta(days=days)
    points = session.exec(
        select(DecisionPointRecord).where(
            DecisionPointRecord.organization_id == organization_id,
            DecisionPointRecord.occurred_at >= since,
        )
    ).all()
    total = len(points)
    judged = [p for p in points if p.consistent is not None]
    consistent = [p for p in judged if p.consistent]
    attributed = [p for p in points if p.attribution not in ("", "none")]
    mismatched_unattributed = [p for p in judged if p.consistent is False and p.attribution in ("", "none")]
    return {
        "windowDays": days,
        "totalPoints": total,
        "judgedPoints": len(judged),
        "consistentPoints": len(consistent),
        "consistencyRate": round(len(consistent) / len(judged), 4) if judged else None,
        "attributedPoints": len(attributed),
        "mismatchedUnattributed": len(mismatched_unattributed),
    }


def build_daily_brief_context(session: Session, *, organization_id: str, target_date: datetime) -> dict:
    day_start, day_end, local_day = _site_day_window(target_date)
    points = session.exec(
        select(DecisionPointRecord).where(
            DecisionPointRecord.organization_id == organization_id,
            DecisionPointRecord.occurred_at >= day_start,
            DecisionPointRecord.occurred_at < day_end,
        )
    ).all()
    plan_points = [p for p in points if p.event_type == "plan_vs_actual"]
    items: list[dict] = []
    for point in sorted(plan_points, key=lambda p: p.subject_ref):
        planned = point.plan_json.get("plannedTotal")
        actual = point.actual_json.get("actualTotal")
        if actual is None:
            state = "pending_actual"
        elif point.consistent is True:
            state = "consistent"
        elif point.consistent is False:
            state = "mismatch"
        else:
            state = "recorded"
        items.append(
            {
                "decisionPointId": point.id,
                "machineNo": point.subject_ref,
                "plannedTotal": planned,
                "actualTotal": actual,
                "consistent": point.consistent,
                "status": state,
                "moldNo": point.plan_json.get("moldNo"),
                "actualRecordedAt": point.actual_recorded_at.isoformat() if point.actual_recorded_at else None,
                "source": point.source,
            }
        )
    stats = ledger_stats(session, organization_id=organization_id, days=14)
    lines = [f"【4WALL AI｜每日對帳 {local_day:%m/%d}】"]
    if not plan_points:
        lines.append("今日尚無派工單對帳資料。")
    for item in items:
        planned = item["plannedTotal"]
        actual = item["actualTotal"]
        if actual is None:
            lines.append(f"{item['machineNo']}:計畫 {planned if planned is not None else '?'} PCS|實際 待回報")
        else:
            mark = "✅" if item["consistent"] else "⚠️"
            lines.append(f"{item['machineNo']}:計畫 {planned}|實際 {actual} {mark}")
    rate = stats["consistencyRate"]
    rate_text = f"、一致率 {rate:.0%}" if rate is not None else "(實驗中)"
    lines.append(f"影子模式:累積 {stats['totalPoints']} 點(14天){rate_text}")
    lines.append("回報實際:輸入「回報 機台 數量 N」")
    return {
        "available": True,
        "organizationId": organization_id,
        "date": local_day.date().isoformat(),
        "timezone": SITE_TZ_NAME,
        "text": "\n".join(lines),
        "planVsActual": items,
        "stats": stats,
    }


def build_daily_brief(session: Session, *, organization_id: str, target_date: datetime) -> str:
    return str(build_daily_brief_context(session, organization_id=organization_id, target_date=target_date)["text"])


def push_brief_to_bound_groups(session: Session, settings, *, organization_id: str, text: str) -> int:
    if not line_is_configured(settings):
        logger.info("daily_brief_line_disabled", extra={"organization_id": organization_id})
        return 0
    bindings = session.exec(select(LineGroupBinding)).all()
    sent = 0
    for binding in bindings:
        try:
            push_line_message(settings, binding.group_id, [{"type": "text", "text": text}])
            sent += 1
        except LineBotDeliveryError:
            logger.warning("daily_brief_push_failed", extra={"group_id": binding.group_id})
    return sent


# ---------------------------------------------------------------------------
# Mold maintenance sentinel (hidden gem; counter source pluggable)
# ---------------------------------------------------------------------------


def bump_mold_counter(
    session: Session,
    settings,
    *,
    organization_id: str,
    mold_no: str,
    set_count: int | None = None,
    increment: int | None = None,
) -> tuple[MoldMaintenanceRuleRecord | None, bool]:
    """Update a mold counter and alert when the threshold is crossed.

    Returns (rule, alerted). Counter feed is pluggable: manual endpoint today,
    HMI shot-count field the day it exists on the reader.
    """

    rule = session.exec(
        select(MoldMaintenanceRuleRecord).where(
            MoldMaintenanceRuleRecord.organization_id == organization_id,
            MoldMaintenanceRuleRecord.mold_no == mold_no,
            MoldMaintenanceRuleRecord.is_active == True,  # noqa: E712
        )
    ).first()
    if rule is None:
        return None, False
    if set_count is not None:
        rule.current_count = max(0, int(set_count))
    if increment is not None:
        rule.current_count = max(0, rule.current_count + int(increment))
    rule.updated_at = utc_now()
    alerted = False
    crossed = rule.current_count >= rule.threshold_count
    not_yet_alerted = rule.last_alert_at is None or (
        rule.last_reset_at is not None and rule.last_alert_at < rule.last_reset_at
    )
    if crossed and not_yet_alerted:
        rule.last_alert_at = utc_now()
        alerted = True
        text = (
            f"【4WALL AI｜保養提醒】\n模具 {rule.mold_no} 累計 {rule.current_count} 模,"
            f"已達保養門檻 {rule.threshold_count}。\n保養完成後請輸入:「保養完成 {rule.mold_no}」"
        )
        if line_is_configured(settings):
            for binding in session.exec(select(LineGroupBinding)).all():
                try:
                    push_line_message(settings, binding.group_id, [{"type": "text", "text": text}])
                except LineBotDeliveryError:
                    logger.warning("mold_sentinel_push_failed", extra={"mold_no": rule.mold_no})
        else:
            logger.info("mold_sentinel_alert_line_disabled", extra={"mold_no": rule.mold_no})
    session.add(rule)
    return rule, alerted


def reset_mold_counter(
    session: Session,
    *,
    organization_id: str,
    mold_no: str,
    actor_name: str,
) -> MoldMaintenanceRuleRecord | None:
    rule = session.exec(
        select(MoldMaintenanceRuleRecord).where(
            MoldMaintenanceRuleRecord.organization_id == organization_id,
            MoldMaintenanceRuleRecord.mold_no == mold_no,
        )
    ).first()
    if rule is None:
        return None
    rule.current_count = 0
    rule.last_reset_at = utc_now()
    rule.updated_at = utc_now()
    session.add(rule)
    point = DecisionPointRecord(
        organization_id=organization_id,
        event_type="maintenance",
        source="line_report",
        subject_ref=mold_no,
        occurred_at=utc_now(),
        plan_json={"thresholdCount": rule.threshold_count},
        actual_json={"action": "maintenance_done", "reportedBy": actor_name},
        actual_recorded_at=utc_now(),
        status="resolved",
    )
    session.add(point)
    return rule


# ---------------------------------------------------------------------------
# Zone occupancy aggregation (#4 groundwork; G2 evidence)
# ---------------------------------------------------------------------------


def zone_occupancy_summary(
    session: Session,
    *,
    organization_id: str,
    start: datetime,
    end: datetime,
) -> dict:
    zones = session.exec(
        select(SemanticZoneRecord).where(
            SemanticZoneRecord.organization_id == organization_id,
            SemanticZoneRecord.is_active == True,  # noqa: E712
        )
    ).all()
    observations = session.exec(
        select(CameraPersonObservation)
        .where(
            CameraPersonObservation.organization_id == organization_id,
            CameraPersonObservation.captured_at >= _as_utc(start),
            CameraPersonObservation.captured_at < _as_utc(end),
        )
        .order_by(CameraPersonObservation.captured_at)
    ).all()
    per_zone: dict[str, dict] = {
        zone.name: {"samples": 0, "occupiedSamples": 0, "peakPersons": 0} for zone in zones
    }
    unmapped_detections = 0
    for observation in observations:
        counts = {zone.name: 0 for zone in zones}
        for detection in observation.detections_json or []:
            floor = detection.get("floorPosition") or {}
            x, z = floor.get("x"), floor.get("z")
            if x is None or z is None:
                unmapped_detections += 1
                continue
            matched = False
            for zone in zones:
                if zone.x_min <= float(x) <= zone.x_max and zone.z_min <= float(z) <= zone.z_max:
                    counts[zone.name] += 1
                    matched = True
                    break
            if not matched:
                unmapped_detections += 1
        for zone_name, count in counts.items():
            bucket = per_zone[zone_name]
            bucket["samples"] += 1
            if count > 0:
                bucket["occupiedSamples"] += 1
            bucket["peakPersons"] = max(bucket["peakPersons"], count)
    for bucket in per_zone.values():
        bucket["occupancyRate"] = (
            round(bucket["occupiedSamples"] / bucket["samples"], 4) if bucket["samples"] else None
        )
    return {
        "zones": per_zone,
        "observationCount": len(observations),
        "unmappedDetections": unmapped_detections,
    }


def upsert_plan_point_from_observation(
    session: Session,
    *,
    camera: CameraDevice,
    observation: CameraOcrObservation,
) -> DecisionPointRecord | None:
    """Ingest-time hook: a stabilized dispatch sheet upserts today's plan point.

    Data-driven so no cron is needed; best-effort and never blocks ingest.
    """

    work_order = (observation.structured_fields_json or {}).get("workOrder") or {}
    if not work_order:
        return None
    machine_field = (work_order.get("fields") or {}).get("machineNo") or {}
    machine_no = machine_field.get("value")
    if not machine_no or machine_no == "unknown":
        return None
    day_start = (
        _as_utc(observation.captured_at)
        .astimezone(SITE_TZ)
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .astimezone(timezone.utc)
    )
    day_end = day_start + timedelta(days=1)
    mold_field = (work_order.get("fields") or {}).get("moldNo") or {}
    plan = {
        "plannedTotal": _quantity_value(work_order, "total"),
        "plannedRows": {key: _quantity_value(work_order, key) for key in _WORK_ORDER_QUANTITY_KEYS},
        "moldNo": mold_field.get("value"),
        "stabilized": bool(work_order.get("stabilized")),
        "cameraId": camera.id,
        "workDate": day_start.date().isoformat(),
    }
    existing = session.exec(
        select(DecisionPointRecord).where(
            DecisionPointRecord.organization_id == camera.organization_id,
            DecisionPointRecord.event_type == "plan_vs_actual",
            DecisionPointRecord.subject_ref == str(machine_no),
            DecisionPointRecord.occurred_at >= day_start,
            DecisionPointRecord.occurred_at < day_end,
        )
    ).first()
    if existing is not None:
        existing.plan_json = {**existing.plan_json, **plan}
        existing.updated_at = utc_now()
        session.add(existing)
        return existing
    point = DecisionPointRecord(
        organization_id=camera.organization_id,
        site_id=camera.site_id,
        event_type="plan_vs_actual",
        source="work_order",
        subject_ref=str(machine_no),
        occurred_at=day_start,
        plan_json=plan,
    )
    session.add(point)
    return point
