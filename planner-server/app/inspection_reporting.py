from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from typing import Iterable
from uuid import uuid4

from sqlmodel import Session, select

from app.models import InspectionEventRecord, InspectionReport, Mission, MissionArtifact
from app.inspection_control import mission_status_for_report
from app.web_dto import (
    EvidenceArtifactDto,
    InspectionEventDto,
    InspectionReportSummaryDto,
    OverviewEventSummaryDto,
)


REPORT_ARTIFACT_NAME = "inspection_report.html"


def load_reporting_state(
    session: Session,
    mission_ids: Iterable[str],
) -> tuple[dict[str, InspectionReport], dict[str, list[InspectionEventRecord]], dict[tuple[str, str], MissionArtifact]]:
    mission_id_list = [mission_id for mission_id in mission_ids if mission_id]
    if not mission_id_list:
        return {}, {}, {}

    reports = session.exec(
        select(InspectionReport)
        .where(InspectionReport.mission_id.in_(mission_id_list))
        .order_by(InspectionReport.generated_at.desc(), InspectionReport.updated_at.desc(), InspectionReport.created_at.desc())
    ).all()
    report_map: dict[str, InspectionReport] = {}
    for report in reports:
        report_map.setdefault(report.mission_id, report)

    events = session.exec(
        select(InspectionEventRecord)
        .where(InspectionEventRecord.mission_id.in_(mission_id_list))
        .order_by(InspectionEventRecord.detected_at.desc(), InspectionEventRecord.created_at.desc())
    ).all()
    event_map: dict[str, list[InspectionEventRecord]] = {mission_id: [] for mission_id in mission_id_list}
    for event in events:
        event_map.setdefault(event.mission_id, []).append(event)

    artifacts = session.exec(
        select(MissionArtifact).where(MissionArtifact.mission_id.in_(mission_id_list))
    ).all()
    artifact_map = {(artifact.mission_id, artifact.artifact_name): artifact for artifact in artifacts}
    return report_map, event_map, artifact_map


def serialize_event(
    event: InspectionEventRecord,
    *,
    artifact_map: dict[tuple[str, str], MissionArtifact],
) -> InspectionEventDto:
    evidence_artifacts: list[EvidenceArtifactDto] = []
    for artifact_name in event.evidence_artifact_names_json:
        artifact = artifact_map.get((event.mission_id, artifact_name))
        if artifact is None:
            continue
        evidence_artifacts.append(_serialize_evidence_artifact(event.mission_id, artifact))
    return InspectionEventDto(
        eventId=event.id,
        missionId=event.mission_id,
        siteId=event.site_id,
        category=event.category,
        severity=event.severity,
        summary=event.summary,
        detectedAt=event.detected_at,
        status=event.status,
        evidenceArtifacts=evidence_artifacts,
    )


def serialize_report(
    report: InspectionReport | None,
    *,
    artifact_map: dict[tuple[str, str], MissionArtifact],
) -> InspectionReportSummaryDto | None:
    if report is None:
        return None

    download_artifact = None
    if report.artifact_name:
        artifact = artifact_map.get((report.mission_id, report.artifact_name))
        if artifact is not None:
            download_artifact = _serialize_evidence_artifact(report.mission_id, artifact)

    return InspectionReportSummaryDto(
        reportId=report.id,
        missionId=report.mission_id,
        status=report.status,
        generatedAt=report.generated_at,
        summary=report.summary,
        eventCount=report.event_count,
        downloadArtifact=download_artifact,
    )


def serialize_overview_event(event: InspectionEventRecord | None) -> OverviewEventSummaryDto | None:
    if event is None:
        return None
    return OverviewEventSummaryDto(
        eventId=event.id,
        missionId=event.mission_id,
        category=event.category,
        severity=event.severity,
        summary=event.summary,
        detectedAt=event.detected_at,
    )


def reprocess_demo_analysis(
    session: Session,
    *,
    mission: Mission,
    artifact_service,
    actor_user_id: str,
    mode: str,
) -> InspectionReport:
    existing_reports = session.exec(
        select(InspectionReport).where(InspectionReport.mission_id == mission.id)
    ).all()
    existing_events = session.exec(
        select(InspectionEventRecord).where(InspectionEventRecord.mission_id == mission.id)
    ).all()

    artifact_names_to_remove = {
        report.artifact_name
        for report in existing_reports
        if report.artifact_name
    }
    for event in existing_events:
        artifact_names_to_remove.update(event.evidence_artifact_names_json)

    for artifact_name in artifact_names_to_remove:
        artifact = session.exec(
            select(MissionArtifact).where(
                MissionArtifact.mission_id == mission.id,
                MissionArtifact.artifact_name == artifact_name,
            )
        ).first()
        if artifact is not None:
            session.delete(artifact)

    for event in existing_events:
        session.delete(event)
    for report in existing_reports:
        session.delete(report)
    session.flush()

    now = datetime.now(timezone.utc)
    generated_events: list[InspectionEventRecord] = []

    if mode == "analysis_failed":
        mission.status = mission_status_for_report(report_status="failed", current_status=mission.status)
        session.add(mission)
        report = InspectionReport(
            organization_id=mission.organization_id or "",
            mission_id=mission.id,
            status="failed",
            generated_at=now,
            summary="Analysis pipeline could not derive inspection events from the mission imagery.",
            event_count=0,
            mode=mode,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
        )
        session.add(report)
        session.flush()
        return report

    findings = _demo_findings(mission=mission, mode=mode)
    for finding in findings:
        event = InspectionEventRecord(
            organization_id=mission.organization_id or "",
            mission_id=mission.id,
            site_id=mission.site_id,
            category=finding["category"],
            severity=finding["severity"],
            summary=finding["summary"],
            detected_at=finding["detectedAt"],
            status="open",
            source="demo_analysis",
        )
        session.add(event)
        session.flush()
        artifact_name = f"evidence-{event.id}.svg"
        stored = artifact_service.storage.write(
            key=f"missions/{mission.id}/reporting/{artifact_name}",
            data=_build_evidence_svg(mission=mission, finding=finding).encode("utf-8"),
            content_type="image/svg+xml",
            cache_control="private, max-age=300",
        )
        session.add(
            MissionArtifact(
                mission_id=mission.id,
                organization_id=mission.organization_id,
                artifact_name=artifact_name,
                version=stored.version,
                checksum_sha256=stored.checksum_sha256,
                content_type=stored.content_type,
                storage_key=stored.storage_key,
                cache_control=stored.cache_control,
                size_bytes=stored.size_bytes,
            )
        )
        event.evidence_artifact_names_json = [artifact_name]
        event.updated_at = now
        session.add(event)
        generated_events.append(event)

    report_artifact_name = REPORT_ARTIFACT_NAME
    report = InspectionReport(
        organization_id=mission.organization_id or "",
        mission_id=mission.id,
        status="ready",
        generated_at=now,
        summary=_build_report_summary(mission=mission, events=generated_events, mode=mode),
        event_count=len(generated_events),
        artifact_name=report_artifact_name,
        mode=mode,
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    session.add(report)
    session.flush()

    report_artifact = artifact_service.storage.write(
        key=f"missions/{mission.id}/reporting/{report_artifact_name}",
        data=_build_report_html(mission=mission, report=report, events=generated_events).encode("utf-8"),
        content_type="text/html; charset=utf-8",
        cache_control="private, max-age=300",
    )
    session.add(
        MissionArtifact(
            mission_id=mission.id,
            organization_id=mission.organization_id,
            artifact_name=report_artifact_name,
            version=report_artifact.version,
            checksum_sha256=report_artifact.checksum_sha256,
            content_type=report_artifact.content_type,
            storage_key=report_artifact.storage_key,
            cache_control=report_artifact.cache_control,
            size_bytes=report_artifact.size_bytes,
        )
    )
    mission.status = mission_status_for_report(report_status=report.status, current_status=mission.status)
    session.add(mission)
    return report


def latest_reporting_summaries(
    session: Session,
    mission_ids: Iterable[str],
) -> tuple[InspectionReportSummaryDto | None, OverviewEventSummaryDto | None]:
    report_map, event_map, artifact_map = load_reporting_state(session, mission_ids)

    latest_report_record = next(
        iter(
            sorted(
                report_map.values(),
                key=lambda report: report.generated_at or report.updated_at,
                reverse=True,
            )
        ),
        None,
    )
    latest_event_record = next(
        iter(
            sorted(
                [event for mission_events in event_map.values() for event in mission_events],
                key=lambda event: event.detected_at,
                reverse=True,
            )
        ),
        None,
    )
    return (
        serialize_report(latest_report_record, artifact_map=artifact_map),
        serialize_overview_event(latest_event_record),
    )


def _serialize_evidence_artifact(mission_id: str, artifact: MissionArtifact) -> EvidenceArtifactDto:
    return EvidenceArtifactDto(
        artifactName=artifact.artifact_name,
        downloadUrl=f"/v1/missions/{mission_id}/artifacts/{artifact.artifact_name}",
        contentType=artifact.content_type,
        checksumSha256=artifact.checksum_sha256,
        publishedAt=artifact.created_at,
    )


def _demo_findings(*, mission: Mission, mode: str) -> list[dict]:
    now = datetime.now(timezone.utc)
    if mode == "no_findings":
        return []

    mission_label = mission.mission_name or "Inspection mission"
    return [
        {
            "category": "material_discoloration",
            "severity": "warning",
            "summary": f"{mission_label} detected surface discoloration along the primary facade sweep.",
            "detectedAt": now,
        },
        {
            "category": "joint_water_ingress_risk",
            "severity": "critical",
            "summary": f"{mission_label} flagged a possible water ingress pattern near an upper window joint.",
            "detectedAt": now,
        },
    ]


def _build_report_summary(*, mission: Mission, events: list[InspectionEventRecord], mode: str) -> str:
    if mode == "no_findings":
        return f"No anomalies were detected for {mission.mission_name}. The mission can be marked as a clean inspection pass."
    if not events:
        return f"Inspection reporting completed for {mission.mission_name}, but no actionable events were recorded."
    return f"{len(events)} inspection events were generated for {mission.mission_name}. Review evidence and report export for stakeholder handoff."


def _build_evidence_svg(*, mission: Mission, finding: dict) -> str:
    summary = escape(str(finding["summary"]))
    severity = escape(str(finding["severity"]).upper())
    category = escape(str(finding["category"]).replace("_", " "))
    mission_name = escape(mission.mission_name)
    accent = "#c2410c" if finding["severity"] == "critical" else "#9a3412"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">
  <rect width="1200" height="675" fill="#f7f4ee"/>
  <rect x="40" y="40" width="1120" height="595" rx="28" fill="#fffdf9" stroke="#e5ded2"/>
  <rect x="72" y="88" width="310" height="170" rx="24" fill="#f4ede2"/>
  <rect x="418" y="88" width="710" height="360" rx="24" fill="#efe6d9"/>
  <rect x="446" y="116" width="654" height="304" rx="18" fill="#d6c2ab"/>
  <circle cx="785" cy="268" r="112" fill="{accent}" fill-opacity="0.25"/>
  <circle cx="785" cy="268" r="74" fill="{accent}" fill-opacity="0.4"/>
  <rect x="72" y="286" width="1056" height="305" rx="24" fill="#ffffff" stroke="#e7dfd5"/>
  <text x="96" y="134" fill="#7c2d12" font-size="24" font-family="Arial, Helvetica, sans-serif" letter-spacing="4">EVIDENCE</text>
  <text x="96" y="182" fill="#111827" font-size="42" font-weight="700" font-family="Arial, Helvetica, sans-serif">{mission_name}</text>
  <text x="96" y="222" fill="#4b5563" font-size="24" font-family="Arial, Helvetica, sans-serif">{category}</text>
  <text x="96" y="338" fill="#9a3412" font-size="18" font-family="Arial, Helvetica, sans-serif" letter-spacing="3">{severity}</text>
  <foreignObject x="96" y="362" width="1000" height="180">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; font-size: 28px; color: #111827; line-height: 1.45;">
      {summary}
    </div>
  </foreignObject>
</svg>"""


def _build_report_html(*, mission: Mission, report: InspectionReport, events: list[InspectionEventRecord]) -> str:
    event_rows = "".join(
        f"<li><strong>{escape(event.category.replace('_', ' '))}</strong> | {escape(event.severity)} | {escape(event.summary)}</li>"
        for event in events
    ) or "<li>No anomaly events were recorded for this mission.</li>"
    generated_at = (report.generated_at or datetime.now(timezone.utc)).isoformat()
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{escape(mission.mission_name)} inspection report</title>
    <style>
      body {{
        font-family: Arial, Helvetica, sans-serif;
        margin: 0;
        padding: 40px;
        color: #111827;
        background: #f6f3ee;
      }}
      main {{
        max-width: 920px;
        margin: 0 auto;
        background: white;
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }}
      h1 {{
        margin: 0 0 12px;
        font-size: 36px;
      }}
      h2 {{
        margin-top: 32px;
        font-size: 24px;
      }}
      .meta {{
        color: #4b5563;
        font-size: 14px;
      }}
      ul {{
        line-height: 1.7;
      }}
    </style>
  </head>
  <body>
    <main>
      <p class="meta">Generated at {escape(generated_at)}</p>
      <h1>{escape(mission.mission_name)} inspection report</h1>
      <p>{escape(report.summary or "No summary available.")}</p>
      <h2>Event summary</h2>
      <ul>{event_rows}</ul>
    </main>
  </body>
</html>"""
