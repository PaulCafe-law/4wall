from __future__ import annotations

from io import BytesIO

from botocore.exceptions import ClientError
import pytest

from app.storage import LocalFileArtifactStorage, S3ArtifactStorage


def test_local_file_artifact_storage_delete_removes_file(tmp_path) -> None:
    storage = LocalFileArtifactStorage(str(tmp_path / "artifacts"))
    storage.write(key="camera-frames/test.jpg", data=b"frame", content_type="image/jpeg", cache_control="private")

    assert storage.read("camera-frames/test.jpg") == b"frame"

    storage.delete("camera-frames/test.jpg")

    assert storage.read("camera-frames/test.jpg") is None


def test_s3_artifact_storage_read_returns_none_for_client_error_404() -> None:
    storage = S3ArtifactStorage(bucket="bucket", client=FakeS3Client(error_code="404", status_code=404))

    assert storage.read("missing.jpg") is None


def test_s3_artifact_storage_read_returns_none_for_client_error_no_such_key() -> None:
    storage = S3ArtifactStorage(bucket="bucket", client=FakeS3Client(error_code="NoSuchKey", status_code=404))

    assert storage.read("missing.jpg") is None


def test_s3_artifact_storage_read_reraises_non_missing_client_error() -> None:
    storage = S3ArtifactStorage(bucket="bucket", client=FakeS3Client(error_code="AccessDenied", status_code=403))

    with pytest.raises(ClientError):
        storage.read("denied.jpg")


def test_s3_artifact_storage_creates_presigned_get_url() -> None:
    client = FakeS3Client()
    storage = S3ArtifactStorage(bucket="bucket", client=client)

    url = storage.create_presigned_get_url(key="site-map-assets/rent-house/v1/rent-house.v1.sog", expires_in_seconds=300)

    assert url == "https://signed.example.test/get_object"
    assert client.presigned_calls[-1] == {
        "ClientMethod": "get_object",
        "Params": {"Bucket": "bucket", "Key": "site-map-assets/rent-house/v1/rent-house.v1.sog"},
        "ExpiresIn": 300,
    }


class FakeS3Client:
    class exceptions:
        NoSuchKey = type("NoSuchKey", (Exception,), {})

    def __init__(self, *, error_code: str | None = None, status_code: int | None = None) -> None:
        self.error_code = error_code
        self.status_code = status_code
        self.deleted_keys: list[str] = []
        self.presigned_calls: list[dict] = []

    def get_object(self, *, Bucket: str, Key: str):
        if self.error_code:
            raise ClientError(
                {
                    "Error": {"Code": self.error_code},
                    "ResponseMetadata": {"HTTPStatusCode": self.status_code},
                },
                "GetObject",
            )
        return {"Body": BytesIO(b"frame")}

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        self.deleted_keys.append(Key)

    def generate_presigned_url(self, ClientMethod: str, *, Params: dict, ExpiresIn: int) -> str:
        self.presigned_calls.append(
            {
                "ClientMethod": ClientMethod,
                "Params": Params,
                "ExpiresIn": ExpiresIn,
            }
        )
        return f"https://signed.example.test/{ClientMethod}"
