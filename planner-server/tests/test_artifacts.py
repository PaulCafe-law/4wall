from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from app.artifacts import DjiWpmlKmzGenerator, MissionArtifactService
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
        kmz_generator=DjiWpmlKmzGenerator(),
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

    kmz_path = tmp_path / "artifact.kmz"
    kmz_path.write_bytes(service.read(artifacts.mission_kmz.storage_key) or b"")
    with ZipFile(kmz_path) as archive:
        names = set(archive.namelist())
        assert "wpmz/template.kml" in names
        assert "wpmz/waylines.wpml" in names
        template = archive.read("wpmz/template.kml")
        waylines = archive.read("wpmz/waylines.wpml")

    ET.fromstring(template)
    waylines_root = ET.fromstring(waylines)
    coordinates = [
        element.text
        for element in waylines_root.findall(".//{http://www.opengis.net/kml/2.2}coordinates")
    ]
    assert len(coordinates) == 2
    assert coordinates == ["121.56472,25.03412", "121.56501,25.03441"]

    heights = [
        element.text
        for element in waylines_root.findall(".//{http://www.dji.com/wpmz/1.0.2}executeHeight")
    ]
    speeds = [
        element.text
        for element in waylines_root.findall(".//{http://www.dji.com/wpmz/1.0.2}waypointSpeed")
    ]
    assert heights == ["35", "35"]
    assert speeds == ["4", "4"]
