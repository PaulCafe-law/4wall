from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import uuid4
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.audit import record_audit
from app.deps import CurrentWebUser, get_current_web_user, get_session, get_settings
from app.industrial_data_engine.constants import JOB_MODES
from app.industrial_data_engine.pipeline import ensure_job_stages
from app.industrial_data_engine.storage import IndustrialArtifactStore
from app.models import IndustrialEngineInputAsset, IndustrialEngineJob, IndustrialEngineJobStage, Organization, Site
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access


router = APIRouter(prefix="/v1/industrial-data-engine", tags=["industrial-data-engine"])

IndustrialMode = Literal["text_to_world", "real_factory_photos_to_world"]
IndustrialStatus = Literal["queued", "running", "succeeded", "failed"]


class IndustrialEngineStageDto(BaseModel):
    sequence: int
    name: str
    status: str
    reason: str | None = None
    output: dict[str, Any] = Field(default_factory=dict)
    startedAt: datetime | None = None
    completedAt: datetime | None = None


class IndustrialEngineInputAssetDto(BaseModel):
    inputAssetId: str
    fileName: str
    contentType: str
    sizeBytes: int
    createdAt: datetime


class IndustrialEngineExportDto(BaseModel):
    artifactName: str
    downloadUrl: str
    contentType: str
    sizeBytes: int


class IndustrialEngineJobDto(BaseModel):
    jobId: str
    organizationId: str
    siteId: str | None = None
    status: IndustrialStatus
    mode: IndustrialMode
    currentStage: str | None = None
    failureReason: str | None = None
    request: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] = Field(default_factory=dict)
    stages: list[IndustrialEngineStageDto] = Field(default_factory=list)
    inputs: list[IndustrialEngineInputAssetDto] = Field(default_factory=list)
    exports: list[IndustrialEngineExportDto] = Field(default_factory=list)
    createdAt: datetime
    updatedAt: datetime
    startedAt: datetime | None = None
    completedAt: datetime | None = None


@router.post("/jobs", response_model=IndustrialEngineJobDto)
async def create_industrial_engine_job(
    organizationId: str = Form(...),
    siteId: str | None = Form(default=None),
    mode: str = Form(...),
    factoryAreaType: str = Form(...),
    incidentTypes: str = Form(default="[]"),
    cameraModes: str = Form(default="[]"),
    notes: str = Form(default=""),
    qualityThreshold: float = Form(default=0.7),
    photos: list[UploadFile] | None = File(default=None),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> IndustrialEngineJobDto:
    _require_organization(session, organizationId)
    ensure_org_write_access(session, current_user, organizationId, action="industrial_engine.job.create_access")
    if mode not in JOB_MODES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_industrial_engine_mode")
    if siteId:
        _require_site(session, siteId, organizationId)

    uploads = [photo for photo in photos or [] if photo.filename]
    if mode == "real_factory_photos_to_world" and not uploads:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="photos_required_for_real_factory_mode")

    request_json = {
        "organizationId": organizationId,
        "siteId": siteId,
        "mode": mode,
        "factoryAreaType": factoryAreaType.strip(),
        "incidentTypes": _parse_list_field(incidentTypes),
        "cameraModes": _parse_list_field(cameraModes),
        "notes": notes.strip(),
        "qualityThreshold": qualityThreshold,
    }
    job = IndustrialEngineJob(
        organization_id=organizationId,
        site_id=siteId,
        created_by_user_id=current_user.user.id,
        mode=mode,
        status="queued",
        request_json=request_json,
    )
    session.add(job)
    session.flush()
    ensure_job_stages(session, job.id)

    store = IndustrialArtifactStore.from_settings(settings)
    for upload in uploads:
        data = await upload.read()
        if not data:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="empty_photo_upload")
        safe_name = _safe_file_name(upload.filename or "factory-photo.jpg")
        storage_key = store.write_bytes(
            job_id=job.id,
            relative_path=f"inputs/{uuid4().hex}_{safe_name}",
            data=data,
            content_type=upload.content_type or "application/octet-stream",
        )
        session.add(
            IndustrialEngineInputAsset(
                job_id=job.id,
                file_name=safe_name,
                content_type=upload.content_type or "application/octet-stream",
                storage_key=storage_key,
                size_bytes=len(data),
            )
        )

    record_audit(
        session,
        action="industrial_engine.job.created",
        organization_id=organizationId,
        actor_user_id=current_user.user.id,
        target_type="industrial_engine_job",
        target_id=job.id,
        metadata={"mode": mode, "photoCount": len(uploads)},
    )
    session.commit()
    return _serialize_job(session, job)


@router.get("/jobs", response_model=list[IndustrialEngineJobDto])
def list_industrial_engine_jobs(
    organizationId: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[IndustrialEngineJobDto]:
    statement = apply_org_read_scope(select(IndustrialEngineJob), IndustrialEngineJob.organization_id, current_user)
    if organizationId:
        ensure_org_read_access(session, current_user, organizationId, action="industrial_engine.job.list_access")
        statement = statement.where(IndustrialEngineJob.organization_id == organizationId)
    statement = statement.order_by(IndustrialEngineJob.created_at.desc())
    return [_serialize_job(session, job) for job in session.exec(statement).all()]


@router.get("/jobs/{job_id}", response_model=IndustrialEngineJobDto)
def get_industrial_engine_job(
    job_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> IndustrialEngineJobDto:
    job = _load_job_for_read(session, current_user, job_id)
    return _serialize_job(session, job)


@router.get("/jobs/{job_id}/status", response_model=IndustrialEngineJobDto)
def get_industrial_engine_job_status(
    job_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> IndustrialEngineJobDto:
    job = _load_job_for_read(session, current_user, job_id)
    return _serialize_job(session, job)


@router.get("/jobs/{job_id}/exports/{artifact_name}")
def download_industrial_engine_export(
    job_id: str,
    artifact_name: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> Response:
    job = _load_job_for_read(session, current_user, job_id)
    export = next((item for item in job.exports_json if item.get("artifactName") == artifact_name), None)
    if export is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="industrial_engine_export_not_found")
    storage_key = str(export.get("storageKey") or "")
    if not storage_key.startswith(f"{job.id}/"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="export_key_out_of_scope")
    data = IndustrialArtifactStore.from_settings(settings).read_bytes(storage_key)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="industrial_engine_export_missing")
    file_name = _safe_file_name(artifact_name)
    return Response(
        content=data,
        media_type=export.get("contentType") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


def _load_job_for_read(session: Session, current_user: CurrentWebUser, job_id: str) -> IndustrialEngineJob:
    job = session.get(IndustrialEngineJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="industrial_engine_job_not_found")
    ensure_org_read_access(session, current_user, job.organization_id, action="industrial_engine.job.read_access")
    return job


def _require_organization(session: Session, organization_id: str) -> Organization:
    organization = session.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization_not_found")
    return organization


def _require_site(session: Session, site_id: str, organization_id: str) -> Site:
    site = session.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="site_not_found")
    if site.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="site_not_in_organization")
    return site


def _serialize_job(session: Session, job: IndustrialEngineJob) -> IndustrialEngineJobDto:
    stages = list(
        session.exec(
            select(IndustrialEngineJobStage)
            .where(IndustrialEngineJobStage.job_id == job.id)
            .order_by(IndustrialEngineJobStage.sequence)
        ).all()
    )
    inputs = list(
        session.exec(
            select(IndustrialEngineInputAsset)
            .where(IndustrialEngineInputAsset.job_id == job.id)
            .order_by(IndustrialEngineInputAsset.created_at.asc())
        ).all()
    )
    return IndustrialEngineJobDto(
        jobId=job.id,
        organizationId=job.organization_id,
        siteId=job.site_id,
        status=job.status,
        mode=job.mode,
        currentStage=job.current_stage,
        failureReason=job.failure_reason,
        request=job.request_json,
        result=job.result_json,
        stages=[
            IndustrialEngineStageDto(
                sequence=stage.sequence,
                name=stage.name,
                status=stage.status,
                reason=stage.reason,
                output=stage.output_json,
                startedAt=stage.started_at,
                completedAt=stage.completed_at,
            )
            for stage in stages
        ],
        inputs=[
            IndustrialEngineInputAssetDto(
                inputAssetId=asset.id,
                fileName=asset.file_name,
                contentType=asset.content_type,
                sizeBytes=asset.size_bytes,
                createdAt=asset.created_at,
            )
            for asset in inputs
        ],
        exports=[
            IndustrialEngineExportDto(
                artifactName=str(item.get("artifactName") or ""),
                downloadUrl=str(item.get("downloadUrl") or ""),
                contentType=str(item.get("contentType") or "application/octet-stream"),
                sizeBytes=int(item.get("sizeBytes") or 0),
            )
            for item in job.exports_json
        ],
        createdAt=job.created_at,
        updatedAt=job.updated_at,
        startedAt=job.started_at,
        completedAt=job.completed_at,
    )


def _parse_list_field(value: str) -> list[str]:
    value = value.strip()
    if not value:
        return []
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        payload = [item.strip() for item in value.split(",")]
    if not isinstance(payload, list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_list_field")
    return [str(item).strip() for item in payload if str(item).strip()]


def _safe_file_name(value: str) -> str:
    name = Path(value).name.replace('"', "").replace("\\", "_").replace("/", "_").strip()
    return name or f"artifact-{datetime.now(timezone.utc).timestamp():.0f}"
