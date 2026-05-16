from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import json
from math import atan2, cos, radians, sin, sqrt
from zipfile import ZIP_DEFLATED, ZipFile
import xml.etree.ElementTree as ET

from app.dto import MissionArtifactDescriptorDto, MissionArtifactsDto, MissionBundleDto, MissionMetaDto
from app.storage import ArtifactStorage, StoredArtifact

KML_NAMESPACE = "http://www.opengis.net/kml/2.2"
WPML_NAMESPACE = "http://www.uav.com/wpmz/1.0.2"
MINI_4_PRO_DRONE_ENUM = 68
MINI_4_PRO_DRONE_SUB_ENUM = 0
MINI_4_PRO_MIN_WAYPOINT_SPEED_MPS = 2.5


class MissionKmzGenerator:
    def generate(self, mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> bytes:
        raise NotImplementedError


class DjiWpmlKmzGenerator(MissionKmzGenerator):
    def generate(self, mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("wpmz/template.kml", _build_template_kml(mission_bundle, mission_meta))
            archive.writestr("wpmz/waylines.wpml", _build_waylines_wpml(mission_bundle, mission_meta))
        return buffer.getvalue()


MockMissionKmzGenerator = DjiWpmlKmzGenerator


@dataclass(frozen=True)
class MissionArtifactBundle:
    mission_meta: MissionMetaDto
    mission_kmz: StoredArtifact
    mission_meta_json: StoredArtifact


@dataclass(frozen=True)
class DjiWpmlKmzDiagnostic:
    entries: tuple[str, ...]
    template_placemark_count: int
    wayline_placemark_count: int
    wayline_ids: tuple[int, ...]
    drone_enum_values: tuple[int, ...]
    drone_sub_enum_values: tuple[int, ...]
    execute_heights: tuple[float, ...]
    waypoint_speeds: tuple[float, ...]
    action_actuator_funcs: tuple[str, ...]
    errors: tuple[str, ...]

    @property
    def valid(self) -> bool:
        return not self.errors

    def require_valid(self) -> None:
        if self.errors:
            raise ValueError("Invalid DJI WPML KMZ: " + "; ".join(self.errors))


class MissionArtifactService:
    def __init__(self, *, storage: ArtifactStorage, kmz_generator: MissionKmzGenerator) -> None:
        self.storage = storage
        self.kmz_generator = kmz_generator

    def generate_and_store(
        self,
        *,
        mission_id: str,
        bundle_version: str,
        mission_bundle: MissionBundleDto,
        mission_meta: MissionMetaDto,
    ) -> MissionArtifactBundle:
        placeholder_meta = mission_meta.model_copy(
            update={
                "artifacts": MissionArtifactsDto(
                    missionKmz=MissionArtifactDescriptorDto(
                        downloadUrl=f"/v1/missions/{mission_id}/artifacts/mission.kmz",
                        version=1,
                        checksumSha256="pending",
                        contentType="application/vnd.google-earth.kmz",
                        sizeBytes=0,
                        cacheControl="private, max-age=300",
                    ),
                    missionMeta=MissionArtifactDescriptorDto(
                        downloadUrl=f"/v1/missions/{mission_id}/artifacts/mission_meta.json",
                        version=1,
                        checksumSha256="pending",
                        contentType="application/json",
                        sizeBytes=0,
                        cacheControl="private, max-age=300",
                    ),
                )
            }
        )
        mission_kmz_bytes = self.kmz_generator.generate(mission_bundle, placeholder_meta)
        diagnose_dji_wpml_kmz(mission_kmz_bytes).require_valid()
        mission_kmz = self.storage.write(
            key=f"missions/{mission_id}/v1/mission.kmz",
            data=mission_kmz_bytes,
            content_type="application/vnd.google-earth.kmz",
            cache_control="private, max-age=300",
        )
        final_meta = placeholder_meta.model_copy(
            update={
                "artifacts": MissionArtifactsDto(
                    missionKmz=MissionArtifactDescriptorDto(
                        downloadUrl=f"/v1/missions/{mission_id}/artifacts/mission.kmz",
                        version=mission_kmz.version,
                        checksumSha256=mission_kmz.checksum_sha256,
                        contentType=mission_kmz.content_type,
                        sizeBytes=mission_kmz.size_bytes,
                        cacheControl=mission_kmz.cache_control,
                    ),
                    missionMeta=MissionArtifactDescriptorDto(
                        downloadUrl=f"/v1/missions/{mission_id}/artifacts/mission_meta.json",
                        version=1,
                        checksumSha256="published-via-header",
                        contentType="application/json",
                        sizeBytes=0,
                        cacheControl="private, max-age=300",
                    ),
                )
            }
        )
        mission_meta_bytes = json.dumps(
            final_meta.model_dump(mode="json"),
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        mission_meta_json = self.storage.write(
            key=f"missions/{mission_id}/v1/mission_meta.json",
            data=mission_meta_bytes,
            content_type="application/json",
            cache_control="private, max-age=300",
        )
        final_meta = final_meta.model_copy(
            update={
                "artifacts": MissionArtifactsDto(
                    missionKmz=final_meta.artifacts.missionKmz,
                    missionMeta=MissionArtifactDescriptorDto(
                        downloadUrl=f"/v1/missions/{mission_id}/artifacts/mission_meta.json",
                        version=mission_meta_json.version,
                        checksumSha256=mission_meta_json.checksum_sha256,
                        contentType=mission_meta_json.content_type,
                        sizeBytes=mission_meta_json.size_bytes,
                        cacheControl=mission_meta_json.cache_control,
                    ),
                )
            }
        )
        return MissionArtifactBundle(
            mission_meta=final_meta,
            mission_kmz=mission_kmz,
            mission_meta_json=mission_meta_json,
        )

    def read(self, storage_key: str) -> bytes | None:
        return self.storage.read(storage_key)


def diagnose_dji_wpml_kmz(kmz_bytes: bytes) -> DjiWpmlKmzDiagnostic:
    errors: list[str] = []
    entries: tuple[str, ...] = ()
    template_placemark_count = 0
    wayline_placemark_count = 0
    wayline_ids: tuple[int, ...] = ()
    drone_enum_values: tuple[int, ...] = ()
    drone_sub_enum_values: tuple[int, ...] = ()
    execute_heights: tuple[float, ...] = ()
    waypoint_speeds: tuple[float, ...] = ()
    action_actuator_funcs: tuple[str, ...] = ()

    try:
        with ZipFile(BytesIO(kmz_bytes)) as archive:
            entries = tuple(sorted(archive.namelist()))
            if "wpmz/template.kml" not in entries:
                errors.append("missing wpmz/template.kml")
            if "wpmz/waylines.wpml" not in entries:
                errors.append("missing wpmz/waylines.wpml")
            template_xml = archive.read("wpmz/template.kml") if "wpmz/template.kml" in entries else b""
            waylines_xml = archive.read("wpmz/waylines.wpml") if "wpmz/waylines.wpml" in entries else b""
    except Exception as error:
        return DjiWpmlKmzDiagnostic(
            entries=entries,
            template_placemark_count=0,
            wayline_placemark_count=0,
            wayline_ids=(),
            drone_enum_values=(),
            drone_sub_enum_values=(),
            execute_heights=(),
            waypoint_speeds=(),
            action_actuator_funcs=(),
            errors=(f"invalid zip archive: {error}",),
        )

    if errors:
        return DjiWpmlKmzDiagnostic(
            entries=entries,
            template_placemark_count=0,
            wayline_placemark_count=0,
            wayline_ids=(),
            drone_enum_values=(),
            drone_sub_enum_values=(),
            execute_heights=(),
            waypoint_speeds=(),
            action_actuator_funcs=(),
            errors=tuple(errors),
        )

    if WPML_NAMESPACE.encode("utf-8") not in template_xml or WPML_NAMESPACE.encode("utf-8") not in waylines_xml:
        errors.append(f"missing WPML namespace {WPML_NAMESPACE}")

    try:
        template_root = ET.fromstring(template_xml)
        waylines_root = ET.fromstring(waylines_xml)
    except ET.ParseError as error:
        return DjiWpmlKmzDiagnostic(
            entries=entries,
            template_placemark_count=0,
            wayline_placemark_count=0,
            wayline_ids=(),
            drone_enum_values=(),
            drone_sub_enum_values=(),
            execute_heights=(),
            waypoint_speeds=(),
            action_actuator_funcs=(),
            errors=(f"invalid XML: {error}",),
        )

    template_placemark_count = len(template_root.findall(f".//{{{KML_NAMESPACE}}}Placemark"))
    wayline_placemark_count = len(waylines_root.findall(f".//{{{KML_NAMESPACE}}}Placemark"))
    wayline_ids = tuple(_int_values(waylines_root, f".//{{{WPML_NAMESPACE}}}waylineId"))
    drone_enum_values = tuple(_int_values(waylines_root, f".//{{{WPML_NAMESPACE}}}droneEnumValue"))
    drone_sub_enum_values = tuple(_int_values(waylines_root, f".//{{{WPML_NAMESPACE}}}droneSubEnumValue"))
    execute_heights = tuple(_float_values(waylines_root, f".//{{{WPML_NAMESPACE}}}executeHeight"))
    waypoint_speeds = tuple(_float_values(waylines_root, f".//{{{WPML_NAMESPACE}}}waypointSpeed"))
    action_actuator_funcs = tuple(
        element.text or ""
        for element in waylines_root.findall(f".//{{{WPML_NAMESPACE}}}actionActuatorFunc")
    )

    if template_placemark_count != 0:
        errors.append("template.kml must not contain executable placemarks")
    if wayline_placemark_count < 1:
        errors.append("waylines.wpml must contain at least one waypoint placemark")
    if 0 not in wayline_ids:
        errors.append("waylines.wpml missing waylineId=0")
    if MINI_4_PRO_DRONE_ENUM not in drone_enum_values:
        errors.append(f"droneInfo missing droneEnumValue={MINI_4_PRO_DRONE_ENUM}")
    if MINI_4_PRO_DRONE_SUB_ENUM not in drone_sub_enum_values:
        errors.append(f"droneInfo missing droneSubEnumValue={MINI_4_PRO_DRONE_SUB_ENUM}")
    if len(execute_heights) != wayline_placemark_count or any(height <= 0 for height in execute_heights):
        errors.append("every waypoint must have positive executeHeight")
    if len(waypoint_speeds) != wayline_placemark_count or any(
        speed < MINI_4_PRO_MIN_WAYPOINT_SPEED_MPS for speed in waypoint_speeds
    ):
        errors.append(f"every waypointSpeed must be >= {MINI_4_PRO_MIN_WAYPOINT_SPEED_MPS}")
    if not action_actuator_funcs:
        errors.append("waylines.wpml missing action groups")

    return DjiWpmlKmzDiagnostic(
        entries=entries,
        template_placemark_count=template_placemark_count,
        wayline_placemark_count=wayline_placemark_count,
        wayline_ids=wayline_ids,
        drone_enum_values=drone_enum_values,
        drone_sub_enum_values=drone_sub_enum_values,
        execute_heights=execute_heights,
        waypoint_speeds=waypoint_speeds,
        action_actuator_funcs=action_actuator_funcs,
        errors=tuple(errors),
    )


def _build_template_kml(mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> str:
    generated_ms = int(mission_meta.generatedAt.timestamp() * 1000)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="{WPML_NAMESPACE}">
  <Document>
    <wpml:author>4Wall AI</wpml:author>
    <wpml:createTime>{generated_ms}</wpml:createTime>
    <wpml:updateTime>{generated_ms}</wpml:updateTime>
{_mission_config_xml(mission_bundle, indent="    ")}
  </Document>
</kml>
"""


def _build_waylines_wpml(mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> str:
    points = _closed_path(mission_bundle)
    placemarks = "\n".join(
        _wayline_waypoint_placemark(index, point, mission_bundle, waypoint_count=len(points))
        for index, point in enumerate(points)
    )
    speed = _dji_waypoint_speed(mission_bundle.defaultSpeedMetersPerSecond)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="{WPML_NAMESPACE}">
  <Document>
{_mission_config_xml(mission_bundle, indent="    ")}
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>{_fmt(speed)}</wpml:autoFlightSpeed>
{placemarks}
    </Folder>
  </Document>
</kml>
"""


def _mission_config_xml(
    mission_bundle: MissionBundleDto,
    *,
    indent: str,
) -> str:
    child_indent = indent + "  "
    return f"""{indent}<wpml:missionConfig>
{child_indent}<wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
{child_indent}<wpml:finishAction>{'goHome' if mission_bundle.returnHomeOnFinish else 'noAction'}</wpml:finishAction>
{child_indent}<wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
{child_indent}<wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
{child_indent}<wpml:globalTransitionalSpeed>{_fmt(_dji_waypoint_speed(mission_bundle.defaultSpeedMetersPerSecond))}</wpml:globalTransitionalSpeed>
{child_indent}<wpml:droneInfo>
{child_indent}  <wpml:droneEnumValue>{MINI_4_PRO_DRONE_ENUM}</wpml:droneEnumValue>
{child_indent}  <wpml:droneSubEnumValue>{MINI_4_PRO_DRONE_SUB_ENUM}</wpml:droneSubEnumValue>
{child_indent}</wpml:droneInfo>
{indent}</wpml:missionConfig>"""


def _wayline_waypoint_placemark(
    index: int,
    point: tuple[str, float, float, float | None, float | None, int | None],
    mission_bundle: MissionBundleDto,
    *,
    waypoint_count: int,
) -> str:
    _label, lat, lng, altitude, speed, _hold_seconds = point
    height = altitude or mission_bundle.defaultAltitudeMeters
    waypoint_speed = _dji_waypoint_speed(speed or mission_bundle.defaultSpeedMetersPerSecond)
    heading_angle_enable = 1 if waypoint_count <= 2 or index in (0, waypoint_count - 1) else 0
    turn_mode = (
        "toPointAndStopWithContinuityCurvature"
        if waypoint_count <= 2 or index in (0, waypoint_count - 1)
        else "toPointAndPassWithContinuityCurvature"
    )
    return f"""      <Placemark>
        <Point>
          <coordinates>
            {_fmt(lng)},{_fmt(lat)}
          </coordinates>
        </Point>
        <wpml:index>{index}</wpml:index>
        <wpml:executeHeight>{_fmt(height)}</wpml:executeHeight>
        <wpml:waypointSpeed>{_fmt(waypoint_speed)}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>{heading_angle_enable}</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>{turn_mode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
{_gimbal_action_groups(index, waypoint_count)}
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>0</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
      </Placemark>"""


def _gimbal_action_groups(index: int, waypoint_count: int) -> str:
    if waypoint_count <= 1:
        return _gimbal_rotate_action_group(index)

    groups: list[str] = []
    if index == 0:
        groups.append(_gimbal_rotate_action_group(index))
    if index < waypoint_count - 1:
        groups.append(_gimbal_evenly_rotate_action_group(index))
    return "\n".join(groups)


def _gimbal_rotate_action_group(index: int) -> str:
    return f"""        <wpml:actionGroup>
          <wpml:actionGroupId>1</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>{index}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>{index}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>1</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>0</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>"""


def _gimbal_evenly_rotate_action_group(index: int) -> str:
    action_id = index + 2
    return f"""        <wpml:actionGroup>
          <wpml:actionGroupId>2</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>{index}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>{index + 1}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>{action_id}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>0</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>"""


def _closed_path(mission_bundle: MissionBundleDto) -> list[tuple[str, float, float, float | None, float | None, int | None]]:
    points: list[tuple[str, float, float, float | None, float | None, int | None]] = []
    for waypoint in sorted(mission_bundle.orderedWaypoints, key=lambda item: item.sequence):
        points.append(
            (
                str(waypoint.sequence),
                waypoint.location.lat,
                waypoint.location.lng,
                waypoint.altitudeMeters,
                waypoint.speedMetersPerSecond,
                waypoint.holdSeconds,
            )
        )
    return points


def _path_distance_m(mission_bundle: MissionBundleDto) -> float:
    points = _closed_path(mission_bundle)
    return sum(_distance_m(points[index], points[index + 1]) for index in range(len(points) - 1))


def _distance_m(
    start: tuple[str, float, float, float | None, float | None, int | None],
    end: tuple[str, float, float, float | None, float | None, int | None],
) -> float:
    radius_m = 6371000.0
    lat_1 = radians(start[1])
    lat_2 = radians(end[1])
    delta_lat = radians(end[1] - start[1])
    delta_lng = radians(end[2] - start[2])
    haversine = sin(delta_lat / 2) ** 2 + cos(lat_1) * cos(lat_2) * sin(delta_lng / 2) ** 2
    return 2 * radius_m * atan2(sqrt(haversine), sqrt(1 - haversine))


def _fmt(value: float) -> str:
    return f"{value:.7f}".rstrip("0").rstrip(".")


def _dji_waypoint_speed(speed_mps: float) -> float:
    return max(speed_mps, MINI_4_PRO_MIN_WAYPOINT_SPEED_MPS)


def _int_values(root: ET.Element, path: str) -> list[int]:
    values: list[int] = []
    for element in root.findall(path):
        try:
            values.append(int((element.text or "").strip()))
        except ValueError:
            continue
    return values


def _float_values(root: ET.Element, path: str) -> list[float]:
    values: list[float] = []
    for element in root.findall(path):
        try:
            values.append(float((element.text or "").strip()))
        except ValueError:
            continue
    return values
