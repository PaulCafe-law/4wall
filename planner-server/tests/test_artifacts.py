from pathlib import Path

from app.artifacts import MissionArtifactService, MockMissionKmzGenerator
from app.corridor import CorridorGenerator
from app.dto import MissionPlanRequestDto
from app.providers import MockRouteProvider
from app.storage import LocalFileArtifactStorage
from tests.helpers import valid_request_payload


def test_local_artifact_storage_persists_generated_kmz_and_meta(tmp_path: Path) -> None:
    request = MissionPlanRequestDto(**valid_request_payload())
    plan = CorridorGenerator().generate(
        request=request,
        route_path=MockRouteProvider().plan_route(request),
        mission_id="msn-local-001",
    )
    service = MissionArtifactService(
        storage=LocalFileArtifactStorage(str(tmp_path / "artifacts")),
        kmz_generator=MockMissionKmzGenerator(),
    )

    artifacts = service.generate_and_store(
        mission_id="msn-local-001",
        bundle_version=plan.bundle_version,
        mission_bundle=plan.mission_bundle,
        mission_meta=plan.mission_meta,
    )

    assert service.read(artifacts.mission_kmz.storage_key) is not None
    assert service.read(artifacts.mission_meta_json.storage_key) is not None
    assert artifacts.mission_kmz.checksum_sha256
    assert artifacts.mission_meta_json.checksum_sha256
