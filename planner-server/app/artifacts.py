from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import json
from zipfile import ZIP_DEFLATED, ZipFile

from app.dto import MissionBundleDto, MissionMetaDto


class MissionKmzGenerator:
    def generate(self, mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> bytes:
        raise NotImplementedError


class MockMissionKmzGenerator(MissionKmzGenerator):
    def generate(self, mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("mission_meta.json", mission_meta.model_dump_json(indent=2))
            archive.writestr(
                "mission_bundle.json",
                mission_bundle.model_dump_json(indent=2),
            )
            archive.writestr(
                "README.txt",
                "Mock KMZ artifact. Replace with DJI-compatible mission packaging in a later sprint.",
            )
        return buffer.getvalue()


@dataclass
class StoredMissionArtifacts:
    mission_bundle: MissionBundleDto
    mission_meta: MissionMetaDto
    mission_kmz: bytes


class MissionArtifactStore:
    def __init__(self) -> None:
        self._missions: dict[str, StoredMissionArtifacts] = {}
        self._events: dict[str, list[dict[str, object]]] = {}
        self._telemetry: dict[str, list[dict[str, object]]] = {}

    def put(self, mission_id: str, artifacts: StoredMissionArtifacts) -> None:
        self._missions[mission_id] = artifacts

    def get(self, mission_id: str) -> StoredMissionArtifacts | None:
        return self._missions.get(mission_id)

    def append_events(self, flight_id: str, events: list[dict[str, object]]) -> int:
        bucket = self._events.setdefault(flight_id, [])
        bucket.extend(events)
        return len(events)

    def append_telemetry(self, flight_id: str, samples: list[dict[str, object]]) -> int:
        bucket = self._telemetry.setdefault(flight_id, [])
        bucket.extend(samples)
        return len(samples)
