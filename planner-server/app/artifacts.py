from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import json
from math import atan2, cos, radians, sin, sqrt
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape

from app.dto import MissionArtifactDescriptorDto, MissionArtifactsDto, MissionBundleDto, MissionMetaDto
from app.storage import ArtifactStorage, StoredArtifact


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


def _build_template_kml(mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> str:
    placemarks = "\n".join(_waypoint_placemark(index, point, mission_bundle) for index, point in enumerate(_closed_path(mission_bundle)))
    return _document_xml(
        mission_bundle=mission_bundle,
        mission_meta=mission_meta,
        folder_body=f"""
      <wpml:templateId>0</wpml:templateId>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:autoFlightSpeed>{_fmt(mission_bundle.defaultSpeedMetersPerSecond)}</wpml:autoFlightSpeed>
      <wpml:globalHeight>{_fmt(mission_bundle.defaultAltitudeMeters)}</wpml:globalHeight>
      <wpml:globalUseStraightLine>1</wpml:globalUseStraightLine>
      <wpml:globalWaypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:globalWaypointTurnMode>
{placemarks}
""",
    )


def _build_waylines_wpml(mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> str:
    distance_m = _path_distance_m(mission_bundle)
    placemarks = "\n".join(_waypoint_placemark(index, point, mission_bundle) for index, point in enumerate(_closed_path(mission_bundle)))
    return _document_xml(
        mission_bundle=mission_bundle,
        mission_meta=mission_meta,
        folder_body=f"""
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:distance>{_fmt(distance_m)}</wpml:distance>
      <wpml:duration>{_fmt(distance_m / mission_bundle.defaultSpeedMetersPerSecond)}</wpml:duration>
      <wpml:autoFlightSpeed>{_fmt(mission_bundle.defaultSpeedMetersPerSecond)}</wpml:autoFlightSpeed>
{placemarks}
""",
    )


def _document_xml(*, mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto, folder_body: str) -> str:
    generated_ms = int(mission_meta.generatedAt.timestamp() * 1000)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>4Wall AI</wpml:author>
    <wpml:createTime>{generated_ms}</wpml:createTime>
    <wpml:updateTime>{generated_ms}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>{'goHome' if mission_bundle.returnHomeOnFinish else 'noAction'}</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>{_fmt(mission_bundle.defaultAltitudeMeters)}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>{_fmt(mission_bundle.defaultSpeedMetersPerSecond)}</wpml:globalTransitionalSpeed>
    </wpml:missionConfig>
    <Folder>
      <wpml:missionId>{escape(mission_bundle.missionId)}</wpml:missionId>
{folder_body.rstrip()}
    </Folder>
  </Document>
</kml>
"""


def _waypoint_placemark(
    index: int,
    point: tuple[str, float, float, float | None, float | None, int | None],
    mission_bundle: MissionBundleDto,
) -> str:
    label, lat, lng, altitude, speed, hold_seconds = point
    height = altitude or mission_bundle.defaultAltitudeMeters
    waypoint_speed = speed or mission_bundle.defaultSpeedMetersPerSecond
    return f"""      <Placemark>
        <name>{escape(label)}</name>
        <Point>
          <coordinates>{_fmt(lng)},{_fmt(lat)}</coordinates>
        </Point>
        <wpml:index>{index}</wpml:index>
        <wpml:executeHeight>{_fmt(height)}</wpml:executeHeight>
        <wpml:ellipsoidHeight>{_fmt(height)}</wpml:ellipsoidHeight>
        <wpml:waypointSpeed>{_fmt(waypoint_speed)}</wpml:waypointSpeed>
        <wpml:useGlobalSpeed>0</wpml:useGlobalSpeed>
        <wpml:useGlobalHeight>0</wpml:useGlobalHeight>
        <wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam>
        <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
        <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
        <wpml:actionGroup>
          <wpml:actionGroupId>{index}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>{index}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>{index}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>0</wpml:actionId>
            <wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:hoverTime>{max(0, hold_seconds or 0)}</wpml:hoverTime>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>
      </Placemark>"""


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
