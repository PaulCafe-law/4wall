from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import json
from zipfile import ZIP_DEFLATED, ZipFile

from app.dto import MissionArtifactDescriptorDto, MissionArtifactsDto, MissionBundleDto, MissionMetaDto
from app.storage import ArtifactStorage, StoredArtifact


class MissionKmzGenerator:
    def generate(self, mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> bytes:
        raise NotImplementedError


class MockMissionKmzGenerator(MissionKmzGenerator):
    def generate(self, mission_bundle: MissionBundleDto, mission_meta: MissionMetaDto) -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("mission_bundle.json", mission_bundle.model_dump_json(indent=2))
            archive.writestr("mission_meta.json", mission_meta.model_dump_json(indent=2))
            archive.writestr(
                "README.txt",
                "Placeholder KMZ for product beta. Replace with DJI-compatible packing in production hardening.",
            )
        return buffer.getvalue()


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
