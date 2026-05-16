from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from app.artifacts import DjiWpmlKmzGenerator, MissionArtifactService, diagnose_dji_wpml_kmz
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
    diagnostic = diagnose_dji_wpml_kmz(service.read(artifacts.mission_kmz.storage_key) or b"")
    assert diagnostic.valid, diagnostic.errors
    assert diagnostic.entries == ("wpmz/template.kml", "wpmz/waylines.wpml")
    assert diagnostic.template_placemark_count == 0
    assert diagnostic.wayline_placemark_count == 2
    assert diagnostic.wayline_ids == (0,)
    assert diagnostic.drone_enum_values == (68,)
    assert diagnostic.drone_sub_enum_values == (0,)

    kmz_path = tmp_path / "artifact.kmz"
    kmz_path.write_bytes(service.read(artifacts.mission_kmz.storage_key) or b"")
    with ZipFile(kmz_path) as archive:
        names = set(archive.namelist())
        assert "wpmz/template.kml" in names
        assert "wpmz/waylines.wpml" in names
        template = archive.read("wpmz/template.kml")
        waylines = archive.read("wpmz/waylines.wpml")

    template_root = ET.fromstring(template)
    waylines_root = ET.fromstring(waylines)
    wpml_ns = "http://www.uav.com/wpmz/1.0.2"

    assert not template_root.findall(".//{http://www.opengis.net/kml/2.2}Placemark")
    drone_enum_values = [
        element.text
        for element in waylines_root.findall(f".//{{{wpml_ns}}}droneInfo/{{{wpml_ns}}}droneEnumValue")
    ]
    assert drone_enum_values == ["68"]
    finish_actions = [
        element.text
        for element in waylines_root.findall(f".//{{{wpml_ns}}}finishAction")
    ]
    assert finish_actions == ["goHome"]
    coordinates = [
        "".join((element.text or "").split())
        for element in waylines_root.findall(".//{http://www.opengis.net/kml/2.2}coordinates")
    ]
    assert len(coordinates) == 2
    assert coordinates == ["121.56472,25.03412", "121.56501,25.03441"]

    heights = [
        element.text
        for element in waylines_root.findall(f".//{{{wpml_ns}}}executeHeight")
    ]
    speeds = [
        element.text
        for element in waylines_root.findall(f".//{{{wpml_ns}}}waypointSpeed")
    ]
    distance_values = [
        element.text
        for element in waylines_root.findall(f".//{{{wpml_ns}}}distance")
    ]
    duration_values = [
        element.text
        for element in waylines_root.findall(f".//{{{wpml_ns}}}duration")
    ]
    turn_modes = [
        element.text
        for element in waylines_root.findall(
            f".//{{{wpml_ns}}}waypointTurnParam/"
            f"{{{wpml_ns}}}waypointTurnMode"
        )
    ]
    heading_modes = [
        element.text
        for element in waylines_root.findall(
            f".//{{{wpml_ns}}}waypointHeadingParam/"
            f"{{{wpml_ns}}}waypointHeadingMode"
        )
    ]
    gimbal_actions = [
        element.text
        for element in waylines_root.findall(f".//{{{wpml_ns}}}actionActuatorFunc")
    ]
    gimbal_heading_params = waylines_root.findall(f".//{{{wpml_ns}}}waypointGimbalHeadingParam")
    assert heights == ["35", "35"]
    assert speeds == ["4", "4"]
    assert distance_values == ["0"]
    assert duration_values == ["0"]
    assert turn_modes == [
        "toPointAndStopWithContinuityCurvature",
        "toPointAndStopWithContinuityCurvature",
    ]
    assert heading_modes == ["followWayline", "followWayline"]
    assert gimbal_actions == ["gimbalRotate", "gimbalEvenlyRotate"]
    assert len(gimbal_heading_params) == 2


def test_dji_wpml_diagnostic_rejects_placeholder_zip() -> None:
    diagnostic = diagnose_dji_wpml_kmz(b"not-a-kmz")

    assert not diagnostic.valid
    assert diagnostic.errors
