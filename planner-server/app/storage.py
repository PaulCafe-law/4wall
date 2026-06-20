from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
from typing import Protocol

import boto3
from botocore.exceptions import ClientError

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

    def delete(self, key: str) -> None: ...

    def create_presigned_put_url(
        self,
        *,
        key: str,
        content_type: str,
        cache_control: str,
        expires_in_seconds: int,
    ) -> str | None: ...

    def create_presigned_get_url(
        self,
        *,
        key: str,
        expires_in_seconds: int,
    ) -> str | None: ...


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

    def delete(self, key: str) -> None:
        (self.root / key).unlink(missing_ok=True)

    def create_presigned_put_url(
        self,
        *,
        key: str,
        content_type: str,
        cache_control: str,
        expires_in_seconds: int,
    ) -> str | None:
        return None

    def create_presigned_get_url(
        self,
        *,
        key: str,
        expires_in_seconds: int,
    ) -> str | None:
        return None


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
        except ClientError as exc:
            if _is_missing_object_error(exc):
                return None
            raise
        return response["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def create_presigned_put_url(
        self,
        *,
        key: str,
        content_type: str,
        cache_control: str,
        expires_in_seconds: int,
    ) -> str | None:
        return self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ContentType": content_type,
                "CacheControl": cache_control,
            },
            ExpiresIn=expires_in_seconds,
        )

    def create_presigned_get_url(
        self,
        *,
        key: str,
        expires_in_seconds: int,
    ) -> str | None:
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
            },
            ExpiresIn=expires_in_seconds,
        )


def _is_missing_object_error(exc: ClientError) -> bool:
    error = exc.response.get("Error", {})
    code = str(error.get("Code", "")).lower()
    status_code = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code in {"nosuchkey", "notfound", "404"} or status_code == 404
