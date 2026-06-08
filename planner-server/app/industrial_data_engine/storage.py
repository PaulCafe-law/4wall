from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.storage import ArtifactStorage, LocalFileArtifactStorage, S3ArtifactStorage


class IndustrialArtifactStore:
    def __init__(self, storage: ArtifactStorage) -> None:
        self.storage = storage

    @classmethod
    def from_settings(cls, settings: Settings) -> "IndustrialArtifactStore":
        if settings.industrial_storage_provider.lower() == "s3":
            return cls(S3ArtifactStorage.from_settings(settings))
        return cls(LocalFileArtifactStorage(settings.industrial_storage_base_path))

    def key(self, job_id: str, relative_path: str) -> str:
        normalized = relative_path.replace("\\", "/").lstrip("/")
        return f"{job_id}/{normalized}"

    def write_bytes(
        self,
        *,
        job_id: str,
        relative_path: str,
        data: bytes,
        content_type: str,
        cache_control: str = "private, max-age=300",
    ) -> str:
        key = self.key(job_id, relative_path)
        self.storage.write(key=key, data=data, content_type=content_type, cache_control=cache_control)
        return key

    def write_text(self, *, job_id: str, relative_path: str, text: str, content_type: str = "text/plain") -> str:
        return self.write_bytes(job_id=job_id, relative_path=relative_path, data=text.encode("utf-8"), content_type=content_type)

    def read_bytes(self, key: str) -> bytes | None:
        return self.storage.read(key)

    def materialize(self, *, key: str, path: Path) -> Path:
        data = self.read_bytes(key)
        if data is None:
            raise FileNotFoundError(f"artifact_not_found:{key}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path
