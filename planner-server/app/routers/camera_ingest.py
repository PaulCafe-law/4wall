from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from pathlib import Path
import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from app.audit import record_audit
from app.deps import (
    CurrentWebUser,
    get_artifact_storage,
    get_current_camera_device,
    get_current_web_user,
    get_session,
)
from app.models import CameraDevice, CameraFrame, CameraGaugeReading, EquipmentWatchZone, Site, utc_now
from app.security import create_camera_device_token, hash_camera_device_token
from app.storage import ArtifactStorage
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access


router = APIRouter(tags=["camera-ingest"])

FRAME_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,120}$")
FRAME_UPLOAD_TTL_SECONDS = 15 * 60
FRAME_CACHE_CONTROL = "private, max-age=300"
MAX_FRAME_SIZE_BYTES = 5 * 1024 * 1024
SUPPORTED_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png"}
ALLOWED_SEVERITIES = {"low", "medium", "high", "critical"}
GAUGE_SORT_ORDER = {"press_am_meter": 0, "flow_am_meter": 1}


class CreateCameraFrameUploadIntentDto(BaseModel):
    frameId: str = Field(min_length=1, max_length=120)
    capturedAt: datetime
    contentType: str = "image/jpeg"
    checksumSha256: str = Field(min_length=64, max_length=64)
    sizeBytes: int = Field(ge=1, le=MAX_FRAME_SIZE_BYTES)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)


class CameraFrameUploadIntentDto(BaseModel):
    frameId: str
    cameraId: str
    uploadUrl: str | None
    uploadMethod: Literal["PUT"]
    uploadHeaders: dict[str, str] = Field(default_factory=dict)
    uploadRequiresAuth: bool
    uploadExpiresAt: datetime
    storageKey: str
    uploadStatus: str
    analysisStatus: str


class CompleteCameraFrameUploadDto(BaseModel):
    checksumSha256: str | None = Field(default=None, min_length=64, max_length=64)
    sizeBytes: int | None = Field(default=None, ge=1, le=MAX_FRAME_SIZE_BYTES)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)


class CameraFrameDto(BaseModel):
    frameId: str
    cameraId: str
    capturedAt: datetime
    storageKey: str
    contentType: str
    checksumSha256: str | None = None
    sizeBytes: int | None = None
    width: int | None = None
    height: int | None = None
    uploadStatus: str
    analysisStatus: str
    errorMessage: str | None = None
    uploadExpiresAt: datetime
    completedAt: datetime | None = None


class CameraGaugeReadingInputDto(BaseModel):
    gaugeId: str = Field(min_length=1, max_length=80)
    label: str | None = Field(default=None, max_length=120)
    value: float | None = None
    unit: str = Field(default="", max_length=40)
    confidence: float = Field(ge=0, le=1)
    rawPosition: float | None = Field(default=None, ge=0, le=1)
    status: Literal["ok", "degraded", "failed"] = "ok"
    source: Literal["live"] = "live"
    capturedAt: datetime
    frameId: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubmitCameraGaugeReadingsDto(BaseModel):
    readings: list[CameraGaugeReadingInputDto] = Field(min_length=1, max_length=20)


class CameraGaugeReadingDto(BaseModel):
    readingId: str
    cameraId: str
    frameId: str | None = None
    gaugeId: str
    label: str
    value: float | None = None
    unit: str
    confidence: float
    rawPosition: float | None = None
    status: str
    source: str
    capturedAt: datetime
    receivedAt: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class CameraGaugeReadingsResponseDto(BaseModel):
    cameraId: str
    readings: list[CameraGaugeReadingDto]


class CameraHeartbeatRequestDto(BaseModel):
    localSpoolCount: int = Field(default=0, ge=0)
    lastCapturedAt: datetime | None = None
    lastError: str | None = Field(default=None, max_length=500)


class CameraHeartbeatResponseDto(BaseModel):
    cameraId: str
    status: str
    samplingIntervalSeconds: int
    retentionDays: int
    localSpoolHours: int
    receivedAt: datetime


class CameraDeviceConfigDto(BaseModel):
    cameraId: str
    siteId: str | None = None
    name: str
    status: str
    rtspConfigured: bool
    samplingIntervalSeconds: int
    retentionDays: int
    localSpoolHours: int


class CameraDeviceStatusDto(BaseModel):
    cameraId: str
    organizationId: str
    siteId: str | None = None
    name: str
    status: str
    rtspConfigured: bool
    samplingIntervalSeconds: int
    retentionDays: int
    localSpoolHours: int
    lastHeartbeatAt: datetime | None = None
    lastFrameAt: datetime | None = None
    lastError: str | None = None
    uploadedFrameCount: int
    queuedFrameCount: int
    failedFrameCount: int
    latestFrame: CameraFrameDto | None = None
    latestGaugeReadings: list[CameraGaugeReadingDto] = Field(default_factory=list)


class CameraDeviceListDto(BaseModel):
    cameras: list[CameraDeviceStatusDto]


class ProvisionCameraDeviceDto(BaseModel):
    organizationId: str = Field(min_length=1)
    siteId: str | None = None
    name: str = Field(min_length=1, max_length=120)
    status: Literal["active", "inactive"] = "active"
    rtspConfigured: bool = False
    samplingIntervalSeconds: int = Field(default=10, ge=1, le=3600)
    retentionDays: int = Field(default=7, ge=1, le=365)
    localSpoolHours: int = Field(default=24, ge=1, le=168)


class ProvisionedCameraDeviceDto(CameraDeviceStatusDto):
    deviceToken: str
    deviceTokenWarning: str


class CameraDeviceTokenDto(BaseModel):
    cameraId: str
    deviceToken: str
    deviceTokenWarning: str


class EquipmentWatchZoneInputDto(BaseModel):
    zoneId: str | None = None
    name: str = Field(min_length=1, max_length=120)
    equipmentName: str = Field(min_length=1, max_length=120)
    roi: dict[str, Any] = Field(default_factory=dict)
    expectedState: str = Field(min_length=1, max_length=80)
    alertOnStates: list[str] = Field(default_factory=list)
    minConfidence: float = Field(default=0.8, ge=0, le=1)
    severity: str = Field(default="medium")


class EquipmentWatchZoneDto(EquipmentWatchZoneInputDto):
    zoneId: str
    cameraId: str
    organizationId: str
    isActive: bool
    createdAt: datetime
    updatedAt: datetime


class UpdateEquipmentWatchZonesDto(BaseModel):
    zones: list[EquipmentWatchZoneInputDto] = Field(default_factory=list)


class EquipmentWatchZonesDto(BaseModel):
    cameraId: str
    zones: list[EquipmentWatchZoneDto]


@router.get("/v1/camera-ingest/config", response_model=CameraDeviceConfigDto)
def get_camera_device_config(
    camera: CameraDevice = Depends(get_current_camera_device),
) -> CameraDeviceConfigDto:
    return _serialize_device_config(camera)


@router.post("/v1/camera-ingest/upload-intents", response_model=CameraFrameUploadIntentDto)
def create_camera_frame_upload_intent(
    request: CreateCameraFrameUploadIntentDto,
    camera: CameraDevice = Depends(get_current_camera_device),
    session: Session = Depends(get_session),
    storage: ArtifactStorage = Depends(get_artifact_storage),
) -> CameraFrameUploadIntentDto:
    _validate_frame_id(request.frameId)
    extension = _extension_for_content_type(request.contentType)
    checksum = _normalized_sha256(request.checksumSha256)
    existing = session.get(CameraFrame, request.frameId)
    if existing is not None:
        _ensure_frame_belongs_to_camera(existing, camera)
        if existing.upload_status != "uploaded":
            existing.upload_expires_at = _now() + timedelta(seconds=FRAME_UPLOAD_TTL_SECONDS)
            existing.upload_status = "pending"
            existing.error_message = None
            existing.updated_at = _now()
            session.add(existing)
            session.commit()
            session.refresh(existing)
        return _serialize_upload_intent(existing, storage)

    frame = CameraFrame(
        id=request.frameId,
        camera_id=camera.id,
        organization_id=camera.organization_id,
        site_id=camera.site_id,
        captured_at=_as_utc(request.capturedAt),
        storage_key=_frame_storage_key(camera, request.frameId, _as_utc(request.capturedAt), extension),
        content_type=request.contentType,
        checksum_sha256=checksum,
        size_bytes=request.sizeBytes,
        width=request.width,
        height=request.height,
        upload_status="pending",
        analysis_status="pending",
        upload_expires_at=_now() + timedelta(seconds=FRAME_UPLOAD_TTL_SECONDS),
    )
    session.add(frame)
    record_audit(
        session,
        action="camera.frame.upload_intent_created",
        organization_id=camera.organization_id,
        target_type="camera_frame",
        target_id=frame.id,
        metadata={"cameraId": camera.id, "storageKey": frame.storage_key},
    )
    session.commit()
    session.refresh(frame)
    return _serialize_upload_intent(frame, storage)


@router.put("/v1/camera-ingest/frames/{frame_id}/upload", status_code=status.HTTP_204_NO_CONTENT)
async def upload_camera_frame_via_api(
    frame_id: str,
    request: Request,
    camera: CameraDevice = Depends(get_current_camera_device),
    session: Session = Depends(get_session),
    storage: ArtifactStorage = Depends(get_artifact_storage),
) -> Response:
    frame = _load_frame_for_device(session, camera, frame_id)
    _ensure_pending_upload_not_expired(frame)
    content_length = _parse_content_length(request.headers.get("content-length"))
    if content_length and content_length > MAX_FRAME_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="frame_upload_too_large")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="empty_frame_upload")
    if len(data) > MAX_FRAME_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="frame_upload_too_large")
    if frame.size_bytes is not None and len(data) != frame.size_bytes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="size_mismatch")
    storage.write(
        key=frame.storage_key,
        data=data,
        content_type=frame.content_type,
        cache_control=FRAME_CACHE_CONTROL,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/v1/camera-ingest/frames/{frame_id}/complete", response_model=CameraFrameDto)
def complete_camera_frame_upload(
    frame_id: str,
    request: CompleteCameraFrameUploadDto,
    camera: CameraDevice = Depends(get_current_camera_device),
    session: Session = Depends(get_session),
    storage: ArtifactStorage = Depends(get_artifact_storage),
) -> CameraFrameDto:
    frame = _load_frame_for_device(session, camera, frame_id)
    if frame.upload_status == "uploaded":
        return _serialize_frame(frame)
    _ensure_pending_upload_not_expired(frame)
    data = storage.read(frame.storage_key)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="frame_object_missing")
    actual_checksum = hashlib.sha256(data).hexdigest()
    expected_checksum = _normalized_sha256(request.checksumSha256) or frame.checksum_sha256
    if expected_checksum and expected_checksum != actual_checksum:
        frame.upload_status = "failed"
        frame.error_message = "checksum_mismatch"
        frame.updated_at = _now()
        session.add(frame)
        session.commit()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="checksum_mismatch")
    expected_size = request.sizeBytes or frame.size_bytes
    if expected_size is not None and expected_size != len(data):
        frame.upload_status = "failed"
        frame.error_message = "size_mismatch"
        frame.updated_at = _now()
        session.add(frame)
        session.commit()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="size_mismatch")

    frame.checksum_sha256 = actual_checksum
    frame.size_bytes = len(data)
    frame.width = request.width or frame.width
    frame.height = request.height or frame.height
    frame.upload_status = "uploaded"
    frame.analysis_status = "queued"
    frame.completed_at = _now()
    frame.updated_at = frame.completed_at
    camera.last_frame_at = frame.captured_at
    camera.updated_at = _now()
    session.add(frame)
    session.add(camera)
    record_audit(
        session,
        action="camera.frame.upload_completed",
        organization_id=camera.organization_id,
        target_type="camera_frame",
        target_id=frame.id,
        metadata={"cameraId": camera.id, "sizeBytes": frame.size_bytes},
    )
    session.commit()
    session.refresh(frame)
    return _serialize_frame(frame)


@router.get("/v1/camera-ingest/frames/{frame_id}", response_model=CameraFrameDto)
def get_camera_frame_status(
    frame_id: str,
    camera: CameraDevice = Depends(get_current_camera_device),
    session: Session = Depends(get_session),
) -> CameraFrameDto:
    frame = _load_frame_for_device(session, camera, frame_id)
    return _serialize_frame(frame)


@router.post("/v1/camera-ingest/gauge-readings", response_model=CameraGaugeReadingsResponseDto)
def submit_camera_gauge_readings(
    request: SubmitCameraGaugeReadingsDto,
    camera: CameraDevice = Depends(get_current_camera_device),
    session: Session = Depends(get_session),
) -> CameraGaugeReadingsResponseDto:
    created: list[CameraGaugeReading] = []
    for item in request.readings:
        frame_id = item.frameId.strip() if item.frameId else None
        if frame_id:
            frame = _load_frame_for_device(session, camera, frame_id)
            frame_id = frame.id

        reading = CameraGaugeReading(
            camera_id=camera.id,
            organization_id=camera.organization_id,
            site_id=camera.site_id,
            frame_id=frame_id,
            gauge_id=item.gaugeId.strip(),
            label=(item.label or item.gaugeId).strip(),
            value=item.value,
            unit=item.unit.strip(),
            confidence=item.confidence,
            raw_position=item.rawPosition,
            status=item.status,
            source=item.source,
            captured_at=_as_utc(item.capturedAt),
            metadata_json=item.metadata,
        )
        session.add(reading)
        created.append(reading)

    camera.updated_at = _now()
    session.add(camera)
    record_audit(
        session,
        action="camera.gauge_readings.submitted",
        organization_id=camera.organization_id,
        target_type="camera_device",
        target_id=camera.id,
        metadata={"readingCount": len(created), "gaugeIds": [reading.gauge_id for reading in created]},
    )
    session.commit()
    for reading in created:
        session.refresh(reading)
    return CameraGaugeReadingsResponseDto(
        cameraId=camera.id,
        readings=[_serialize_gauge_reading(reading) for reading in created],
    )


@router.post("/v1/camera-ingest/heartbeat", response_model=CameraHeartbeatResponseDto)
def record_camera_heartbeat(
    request: CameraHeartbeatRequestDto,
    camera: CameraDevice = Depends(get_current_camera_device),
    session: Session = Depends(get_session),
) -> CameraHeartbeatResponseDto:
    received_at = _now()
    camera.last_heartbeat_at = received_at
    camera.last_frame_at = _as_utc(request.lastCapturedAt) if request.lastCapturedAt else camera.last_frame_at
    camera.last_error = request.lastError
    camera.updated_at = received_at
    session.add(camera)
    record_audit(
        session,
        action="camera.heartbeat",
        organization_id=camera.organization_id,
        target_type="camera_device",
        target_id=camera.id,
        metadata={"localSpoolCount": request.localSpoolCount, "lastError": request.lastError},
    )
    session.commit()
    return CameraHeartbeatResponseDto(
        cameraId=camera.id,
        status=camera.status,
        samplingIntervalSeconds=camera.sampling_interval_seconds,
        retentionDays=camera.retention_days,
        localSpoolHours=camera.local_spool_hours,
        receivedAt=received_at,
    )


@router.get("/v1/cameras", response_model=CameraDeviceListDto)
def list_camera_devices(
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> CameraDeviceListDto:
    statement = apply_org_read_scope(
        select(CameraDevice).order_by(CameraDevice.created_at.desc()),
        CameraDevice.organization_id,
        current_user,
    )
    cameras = session.exec(statement).all()
    return CameraDeviceListDto(cameras=[_serialize_camera_status(session, camera) for camera in cameras])


@router.post("/v1/cameras", response_model=ProvisionedCameraDeviceDto)
def provision_camera_device(
    request: ProvisionCameraDeviceDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> ProvisionedCameraDeviceDto:
    ensure_org_write_access(session, current_user, request.organizationId, action="camera.provision_access")
    if request.siteId is not None:
        site = session.get(Site, request.siteId)
        if site is None or site.organization_id != request.organizationId:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="site_not_found")

    token = create_camera_device_token()
    camera = CameraDevice(
        organization_id=request.organizationId,
        site_id=request.siteId,
        name=request.name.strip(),
        status=request.status,
        device_token_hash=hash_camera_device_token(token),
        rtsp_configured=request.rtspConfigured,
        sampling_interval_seconds=request.samplingIntervalSeconds,
        retention_days=request.retentionDays,
        local_spool_hours=request.localSpoolHours,
        created_by_user_id=current_user.user.id,
    )
    session.add(camera)
    session.flush()
    record_audit(
        session,
        action="camera.provisioned",
        organization_id=camera.organization_id,
        actor_user_id=current_user.user.id,
        target_type="camera",
        target_id=camera.id,
        metadata={"siteId": camera.site_id, "rtspConfigured": camera.rtsp_configured},
    )
    session.commit()
    session.refresh(camera)
    return ProvisionedCameraDeviceDto(
        **_serialize_camera_status(session, camera).model_dump(),
        deviceToken=token,
        deviceTokenWarning="Store this on the Pi now. The plaintext token is not recoverable.",
    )


@router.get("/v1/cameras/{camera_id}", response_model=CameraDeviceStatusDto)
def get_camera_device(
    camera_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> CameraDeviceStatusDto:
    camera = _load_camera_for_web(session, current_user, camera_id, write=False)
    return _serialize_camera_status(session, camera)


@router.post("/v1/cameras/{camera_id}/device-token", response_model=CameraDeviceTokenDto)
def rotate_camera_device_token(
    camera_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> CameraDeviceTokenDto:
    camera = _load_camera_for_web(session, current_user, camera_id, write=True)
    token = create_camera_device_token()
    camera.device_token_hash = hash_camera_device_token(token)
    camera.updated_at = utc_now()
    session.add(camera)
    record_audit(
        session,
        action="camera.device_token_rotated",
        organization_id=camera.organization_id,
        actor_user_id=current_user.user.id,
        target_type="camera",
        target_id=camera.id,
        metadata={"siteId": camera.site_id},
    )
    session.commit()
    return CameraDeviceTokenDto(
        cameraId=camera.id,
        deviceToken=token,
        deviceTokenWarning="Store this on the Pi now. The plaintext token is not recoverable.",
    )


@router.get("/v1/cameras/{camera_id}/latest-frame/image")
def get_camera_latest_frame_image(
    camera_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    storage: ArtifactStorage = Depends(get_artifact_storage),
) -> Response:
    camera = _load_camera_for_web(session, current_user, camera_id, write=False)
    frame = _latest_uploaded_frame_for_camera(session, camera)
    if frame is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="camera_latest_frame_not_found")
    data = storage.read(frame.storage_key)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="camera_frame_object_missing")
    return Response(
        content=data,
        media_type=frame.content_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Camera-Frame-Id": frame.id,
            "X-Camera-Captured-At": _as_utc(frame.captured_at).isoformat().replace("+00:00", "Z"),
        },
    )


@router.get("/v1/cameras/{camera_id}/watch-zones", response_model=EquipmentWatchZonesDto)
def list_camera_watch_zones(
    camera_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> EquipmentWatchZonesDto:
    camera = _load_camera_for_web(session, current_user, camera_id, write=False)
    zones = session.exec(
        select(EquipmentWatchZone)
        .where(EquipmentWatchZone.camera_id == camera.id, EquipmentWatchZone.is_active == True)  # noqa: E712
        .order_by(EquipmentWatchZone.created_at.asc())
    ).all()
    return EquipmentWatchZonesDto(cameraId=camera.id, zones=[_serialize_zone(zone) for zone in zones])


@router.patch("/v1/cameras/{camera_id}/watch-zones", response_model=EquipmentWatchZonesDto)
def update_camera_watch_zones(
    camera_id: str,
    request: UpdateEquipmentWatchZonesDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> EquipmentWatchZonesDto:
    camera = _load_camera_for_web(session, current_user, camera_id, write=True)
    existing = {
        zone.id: zone
        for zone in session.exec(select(EquipmentWatchZone).where(EquipmentWatchZone.camera_id == camera.id)).all()
    }
    retained_ids: set[str] = set()
    for item in request.zones:
        _validate_zone(item)
        zone = existing.get(item.zoneId or "")
        if zone is None:
            zone = EquipmentWatchZone(
                camera_id=camera.id,
                organization_id=camera.organization_id,
                name=item.name.strip(),
                equipment_name=item.equipmentName.strip(),
                roi_json=item.roi,
                expected_state=item.expectedState.strip(),
                alert_on_states_json=[state.strip() for state in item.alertOnStates if state.strip()],
                min_confidence=item.minConfidence,
                severity=item.severity,
                is_active=True,
            )
        else:
            zone.name = item.name.strip()
            zone.equipment_name = item.equipmentName.strip()
            zone.roi_json = item.roi
            zone.expected_state = item.expectedState.strip()
            zone.alert_on_states_json = [state.strip() for state in item.alertOnStates if state.strip()]
            zone.min_confidence = item.minConfidence
            zone.severity = item.severity
            zone.is_active = True
            zone.updated_at = _now()
        session.add(zone)
        session.flush()
        retained_ids.add(zone.id)

    for zone_id, zone in existing.items():
        if zone_id not in retained_ids and zone.is_active:
            zone.is_active = False
            zone.updated_at = _now()
            session.add(zone)

    record_audit(
        session,
        action="camera.watch_zones.updated",
        organization_id=camera.organization_id,
        actor_user_id=current_user.user.id,
        target_type="camera_device",
        target_id=camera.id,
        metadata={"activeZoneCount": len(request.zones)},
    )
    session.commit()
    return list_camera_watch_zones(camera.id, current_user=current_user, session=session)


def _serialize_upload_intent(frame: CameraFrame, storage: ArtifactStorage) -> CameraFrameUploadIntentDto:
    upload_url = None
    upload_requires_auth = True
    if frame.upload_status != "uploaded":
        upload_url = storage.create_presigned_put_url(
            key=frame.storage_key,
            content_type=frame.content_type,
            cache_control=FRAME_CACHE_CONTROL,
            expires_in_seconds=FRAME_UPLOAD_TTL_SECONDS,
        )
        if upload_url:
            upload_requires_auth = False
        else:
            upload_url = f"/v1/camera-ingest/frames/{frame.id}/upload"
    return CameraFrameUploadIntentDto(
        frameId=frame.id,
        cameraId=frame.camera_id,
        uploadUrl=upload_url,
        uploadMethod="PUT",
        uploadHeaders={"Content-Type": frame.content_type, "Cache-Control": FRAME_CACHE_CONTROL},
        uploadRequiresAuth=upload_requires_auth,
        uploadExpiresAt=frame.upload_expires_at,
        storageKey=frame.storage_key,
        uploadStatus=frame.upload_status,
        analysisStatus=frame.analysis_status,
    )


def _serialize_device_config(camera: CameraDevice) -> CameraDeviceConfigDto:
    return CameraDeviceConfigDto(
        cameraId=camera.id,
        siteId=camera.site_id,
        name=camera.name,
        status=camera.status,
        rtspConfigured=camera.rtsp_configured,
        samplingIntervalSeconds=camera.sampling_interval_seconds,
        retentionDays=camera.retention_days,
        localSpoolHours=camera.local_spool_hours,
    )


def _serialize_frame(frame: CameraFrame) -> CameraFrameDto:
    return CameraFrameDto(
        frameId=frame.id,
        cameraId=frame.camera_id,
        capturedAt=frame.captured_at,
        storageKey=frame.storage_key,
        contentType=frame.content_type,
        checksumSha256=frame.checksum_sha256,
        sizeBytes=frame.size_bytes,
        width=frame.width,
        height=frame.height,
        uploadStatus=frame.upload_status,
        analysisStatus=frame.analysis_status,
        errorMessage=frame.error_message,
        uploadExpiresAt=frame.upload_expires_at,
        completedAt=frame.completed_at,
    )


def _serialize_gauge_reading(reading: CameraGaugeReading) -> CameraGaugeReadingDto:
    return CameraGaugeReadingDto(
        readingId=reading.id,
        cameraId=reading.camera_id,
        frameId=reading.frame_id,
        gaugeId=reading.gauge_id,
        label=reading.label,
        value=reading.value,
        unit=reading.unit,
        confidence=reading.confidence,
        rawPosition=reading.raw_position,
        status=reading.status,
        source=reading.source,
        capturedAt=reading.captured_at,
        receivedAt=reading.created_at,
        metadata=reading.metadata_json,
    )


def _serialize_camera_status(session: Session, camera: CameraDevice) -> CameraDeviceStatusDto:
    latest_frame = _latest_frame_for_camera(session, camera)
    return CameraDeviceStatusDto(
        cameraId=camera.id,
        organizationId=camera.organization_id,
        siteId=camera.site_id,
        name=camera.name,
        status=camera.status,
        rtspConfigured=camera.rtsp_configured,
        samplingIntervalSeconds=camera.sampling_interval_seconds,
        retentionDays=camera.retention_days,
        localSpoolHours=camera.local_spool_hours,
        lastHeartbeatAt=camera.last_heartbeat_at,
        lastFrameAt=camera.last_frame_at,
        lastError=camera.last_error,
        uploadedFrameCount=_count_camera_frames(session, camera, upload_status="uploaded"),
        queuedFrameCount=_count_camera_frames(session, camera, analysis_status="queued"),
        failedFrameCount=_count_camera_frames(session, camera, upload_status="failed")
        + _count_camera_frames(session, camera, analysis_status="failed"),
        latestFrame=_serialize_frame(latest_frame) if latest_frame is not None else None,
        latestGaugeReadings=[
            _serialize_gauge_reading(reading) for reading in _latest_gauge_readings_for_camera(session, camera)
        ],
    )


def _latest_frame_for_camera(session: Session, camera: CameraDevice) -> CameraFrame | None:
    return session.exec(
        select(CameraFrame)
        .where(CameraFrame.camera_id == camera.id)
        .order_by(CameraFrame.captured_at.desc(), CameraFrame.created_at.desc())
    ).first()


def _latest_uploaded_frame_for_camera(session: Session, camera: CameraDevice) -> CameraFrame | None:
    return session.exec(
        select(CameraFrame)
        .where(CameraFrame.camera_id == camera.id, CameraFrame.upload_status == "uploaded")
        .order_by(CameraFrame.captured_at.desc(), CameraFrame.created_at.desc())
    ).first()


def _latest_gauge_readings_for_camera(session: Session, camera: CameraDevice) -> list[CameraGaugeReading]:
    readings = session.exec(
        select(CameraGaugeReading)
        .where(CameraGaugeReading.camera_id == camera.id)
        .order_by(CameraGaugeReading.captured_at.desc(), CameraGaugeReading.created_at.desc())
        .limit(50)
    ).all()
    latest_by_gauge: dict[str, CameraGaugeReading] = {}
    for reading in readings:
        if reading.gauge_id not in latest_by_gauge:
            latest_by_gauge[reading.gauge_id] = reading
    return sorted(
        latest_by_gauge.values(),
        key=lambda reading: (GAUGE_SORT_ORDER.get(reading.gauge_id, 100), reading.gauge_id),
    )


def _serialize_zone(zone: EquipmentWatchZone) -> EquipmentWatchZoneDto:
    return EquipmentWatchZoneDto(
        zoneId=zone.id,
        cameraId=zone.camera_id,
        organizationId=zone.organization_id,
        name=zone.name,
        equipmentName=zone.equipment_name,
        roi=zone.roi_json,
        expectedState=zone.expected_state,
        alertOnStates=zone.alert_on_states_json,
        minConfidence=zone.min_confidence,
        severity=zone.severity,
        isActive=zone.is_active,
        createdAt=zone.created_at,
        updatedAt=zone.updated_at,
    )


def _load_frame_for_device(session: Session, camera: CameraDevice, frame_id: str) -> CameraFrame:
    frame = session.get(CameraFrame, frame_id)
    if frame is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="camera_frame_not_found")
    _ensure_frame_belongs_to_camera(frame, camera)
    return frame


def _ensure_frame_belongs_to_camera(frame: CameraFrame, camera: CameraDevice) -> None:
    if frame.camera_id != camera.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="camera_frame_scope_mismatch")


def _ensure_pending_upload_not_expired(frame: CameraFrame) -> None:
    if _as_utc(frame.upload_expires_at) <= _now():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="upload_intent_expired")


def _load_camera_for_web(
    session: Session,
    current_user: CurrentWebUser,
    camera_id: str,
    *,
    write: bool,
) -> CameraDevice:
    camera = session.get(CameraDevice, camera_id)
    if camera is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="camera_not_found")
    if write:
        ensure_org_write_access(session, current_user, camera.organization_id, action="camera.write_access")
    else:
        ensure_org_read_access(session, current_user, camera.organization_id, action="camera.read_access")
    return camera


def _count_camera_frames(
    session: Session,
    camera: CameraDevice,
    *,
    upload_status: str | None = None,
    analysis_status: str | None = None,
) -> int:
    statement = select(func.count()).select_from(CameraFrame).where(CameraFrame.camera_id == camera.id)
    if upload_status is not None:
        statement = statement.where(CameraFrame.upload_status == upload_status)
    if analysis_status is not None:
        statement = statement.where(CameraFrame.analysis_status == analysis_status)
    return int(session.exec(statement).one())


def _validate_frame_id(frame_id: str) -> None:
    if not FRAME_ID_PATTERN.fullmatch(frame_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_frame_id")


def _extension_for_content_type(content_type: str) -> str:
    extension = SUPPORTED_CONTENT_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="unsupported_frame_content_type")
    return extension


def _validate_zone(zone: EquipmentWatchZoneInputDto) -> None:
    if zone.severity not in ALLOWED_SEVERITIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_watch_zone_severity")
    if not _is_valid_box_roi(zone.roi):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_watch_zone_roi")


def _is_valid_box_roi(roi: dict[str, Any]) -> bool:
    if not isinstance(roi, dict) or roi.get("type") != "box":
        return False
    values = [roi.get(key) for key in ("x", "y", "w", "h")]
    if any(isinstance(value, bool) or not isinstance(value, int | float) for value in values):
        return False
    x, y, width, height = (float(value) for value in values)
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        return False
    if max(x, y, width, height) <= 1:
        return x + width <= 1 and y + height <= 1
    return True


def _frame_storage_key(camera: CameraDevice, frame_id: str, captured_at: datetime, extension: str) -> str:
    safe_frame_id = Path(frame_id).name.replace(".", "_")
    return (
        f"camera-frames/{camera.organization_id}/{camera.id}/"
        f"{captured_at:%Y/%m/%d}/{safe_frame_id}.{extension}"
    )


def _normalized_sha256(value: str | None) -> str | None:
    if value is None:
        return None
    lowered = value.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", lowered):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_checksum_sha256")
    return lowered


def _parse_content_length(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_content_length") from None
    if parsed < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_content_length")
    return parsed


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)
