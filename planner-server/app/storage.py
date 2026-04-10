from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
from typing import Protocol

import boto3

from app.config import Settings


@dataclass(frozen=True)
class StoredArtifact:
    storage_key: str
    version: int
    checksum_sha256: str
    content_type: str
    size_bytes: int
    cache_control: str


class ArtifactStorage(Protocol):
    def write(self, *, key: str, data: bytes, content_type: str, cache_control: str) -> StoredArtifact: ...

    def read(self, key: str) -> bytes | None: ...


class LocalFileArtifactStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def write(self, *, key: str, data: bytes, content_type: str, cache_control: str) -> StoredArtifact:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return StoredArtifact(
            storage_key=key,
            version=1,
            checksum_sha256=hashlib.sha256(data).hexdigest(),
            content_type=content_type,
            size_bytes=len(data),
            cache_control=cache_control,
        )

    def read(self, key: str) -> bytes | None:
        path = self.root / key
        if not path.exists():
            return None
        return path.read_bytes()


class S3ArtifactStorage:
    def __init__(self, *, bucket: str, client) -> None:
        self.bucket = bucket
        self.client = client

    @classmethod
    def from_settings(cls, settings: Settings) -> "S3ArtifactStorage":
        if not settings.s3_bucket:
            raise ValueError("BUILDING_ROUTE_S3_BUCKET is required for s3 artifact backend")
        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )
        return cls(bucket=settings.s3_bucket, client=client)

    def write(self, *, key: str, data: bytes, content_type: str, cache_control: str) -> StoredArtifact:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl=cache_control,
        )
        return StoredArtifact(
            storage_key=key,
            version=1,
            checksum_sha256=hashlib.sha256(data).hexdigest(),
            content_type=content_type,
            size_bytes=len(data),
            cache_control=cache_control,
        )

    def read(self, key: str) -> bytes | None:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except self.client.exceptions.NoSuchKey:
            return None
        return response["Body"].read()
