from __future__ import annotations

from datetime import datetime
from typing import Iterable

from sqlmodel import Session, select

from app.models import Mission, MissionArtifact
from app.web_dto import MissionDeliveryDto, MissionDeliveryStateLiteral


def summarize_mission_delivery(
    mission: Mission,
    artifacts: Iterable[MissionArtifact],
) -> tuple[MissionDeliveryStateLiteral, datetime | None, str | None]:
    artifact_list = list(artifacts)
    published_at = max((artifact.created_at for artifact in artifact_list), default=None)
    if mission.status == "failed":
        return "failed", published_at, extract_failure_reason(mission.response_json)
    if artifact_list:
        return "published", published_at, None
    if mission.status == "planning":
        return "planning", None, None
    return "ready", None, None


def serialize_mission_delivery(mission: Mission, artifacts: Iterable[MissionArtifact]) -> MissionDeliveryDto:
    state, published_at, failure_reason = summarize_mission_delivery(mission, artifacts)
    return MissionDeliveryDto(
        state=state,
        publishedAt=published_at,
        failureReason=failure_reason,
    )


def build_artifact_map(
    session: Session,
    mission_ids: list[str],
) -> dict[str, list[MissionArtifact]]:
    if not mission_ids:
        return {}
    artifacts = session.exec(
        select(MissionArtifact)
        .where(MissionArtifact.mission_id.in_(mission_ids))
        .order_by(MissionArtifact.created_at.asc(), MissionArtifact.artifact_name.asc())
    ).all()
    artifact_map: dict[str, list[MissionArtifact]] = {mission_id: [] for mission_id in mission_ids}
    for artifact in artifacts:
        artifact_map.setdefault(artifact.mission_id, []).append(artifact)
    return artifact_map


def extract_failure_reason(payload: dict) -> str | None:
    direct_candidates = [
        payload.get("failureReason"),
        payload.get("failure_reason"),
        payload.get("error"),
        payload.get("detail"),
        payload.get("message"),
    ]
    for candidate in direct_candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        for key in ("failureReason", "failure_reason", "error", "detail", "message"):
            candidate = metadata.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    return None
