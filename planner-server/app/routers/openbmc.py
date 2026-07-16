from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hmac

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.audit import record_audit
from app.config import Settings
from app.deps import (
    CurrentWebUser,
    get_current_openbmc_connector,
    get_current_web_user,
    get_session,
    get_settings,
)
from app.models import (
    OpenBmcCommand,
    OpenBmcConnector,
    OpenBmcDevice,
    OpenBmcEventRecord,
    OpenBmcTelemetryObservation,
    OrganizationMembership,
    Site,
    UserAccount,
    utc_now,
)
from app.openbmc_dto import (
    OpenBmcCommandClaimDto,
    OpenBmcCommandClaimResponseDto,
    OpenBmcCommandConfirmRequestDto,
    OpenBmcCommandProgressRequestDto,
    OpenBmcCommandProposalRequestDto,
    OpenBmcCommandProposalResponseDto,
    OpenBmcCommandResultRequestDto,
    OpenBmcCommandSpecDto,
    OpenBmcConnectorConfigDeviceDto,
    OpenBmcConnectorConfigDto,
    OpenBmcConnectorListDto,
    OpenBmcConnectorStatusDto,
    OpenBmcConnectorTokenDto,
    OpenBmcEventBatchRequestDto,
    OpenBmcEventBatchResponseDto,
    OpenBmcEventItemDto,
    OpenBmcHeartbeatRequestDto,
    OpenBmcHeartbeatResponseDto,
    OpenBmcObservationIngestResponseDto,
    OpenBmcObservationRequestDto,
    ProvisionedOpenBmcConnectorDto,
    ProvisionOpenBmcConnectorDto,
    ProvisionOpenBmcDeviceDto,
)
from app.openbmc_service import (
    OPENBMC_ACTIVE_COMMAND_STATUSES,
    OPENBMC_TERMINAL_COMMAND_STATUSES,
    as_utc,
    assert_command_guards,
    assert_json_size,
    canonical_proposal_hash,
    command_human_summary,
    command_summary,
    expire_unclaimed_commands,
    normalize_command,
    serialize_device,
    utc_or_none,
)
from app.security import (
    create_openbmc_command_lease,
    create_openbmc_connector_token,
    hash_openbmc_command_lease,
    hash_openbmc_connector_token,
)
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access


router = APIRouter(tags=["openbmc"])


def _connector_status(connector: OpenBmcConnector) -> OpenBmcConnectorStatusDto:
    return OpenBmcConnectorStatusDto(
        connectorId=connector.id,
        organizationId=connector.organization_id,
        siteId=connector.site_id,
        name=connector.name,
        status=connector.status,
        version=connector.version,
        lastHeartbeatAt=utc_or_none(connector.last_heartbeat_at),
        lastObservationAt=utc_or_none(connector.last_observation_at),
        lastErrorCode=connector.last_error_code,
        createdAt=as_utc(connector.created_at),
        updatedAt=as_utc(connector.updated_at),
    )


def _require_integration(settings: Settings) -> None:
    if not settings.openbmc_integration_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="openbmc_integration_disabled")


def _require_live_view(settings: Settings) -> None:
    if settings.openbmc_live_view_enabled:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="openbmc_live_view_disabled")


def _site_for_org(session: Session, organization_id: str, site_id: str) -> Site:
    site = session.get(Site, site_id)
    if site is None or site.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="site_not_found")
    return site


def _load_connector_for_web(
    session: Session,
    current_user: CurrentWebUser,
    connector_id: str,
    *,
    write: bool,
) -> OpenBmcConnector:
    connector = session.get(OpenBmcConnector, connector_id)
    if connector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_connector_not_found")
    guard = ensure_org_write_access if write else ensure_org_read_access
    guard(
        session,
        current_user,
        connector.organization_id,
        action="openbmc.connector_write_access" if write else "openbmc.connector_read_access",
    )
    return connector


def _load_device_for_web(
    session: Session,
    current_user: CurrentWebUser,
    device_id: str,
    *,
    write: bool,
) -> tuple[OpenBmcDevice, OpenBmcConnector]:
    device = session.get(OpenBmcDevice, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_device_not_found")
    guard = ensure_org_write_access if write else ensure_org_read_access
    guard(
        session,
        current_user,
        device.organization_id,
        action="openbmc.device_write_access" if write else "openbmc.device_read_access",
    )
    connector = session.get(OpenBmcConnector, device.connector_id)
    if (
        connector is None
        or connector.organization_id != device.organization_id
        or connector.site_id != device.site_id
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_device_connector_binding_invalid")
    return device, connector


def _load_connector_device(
    session: Session,
    connector: OpenBmcConnector,
    device_id: str,
) -> OpenBmcDevice:
    device = session.get(OpenBmcDevice, device_id)
    if (
        device is None
        or device.connector_id != connector.id
        or device.organization_id != connector.organization_id
        or device.site_id != connector.site_id
    ):
        # Deliberately hide whether another connector's device exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_device_not_found")
    if device.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_device_inactive")
    return device


def _load_command_for_update(
    session: Session,
    settings: Settings,
    command_id: str,
) -> OpenBmcCommand | None:
    statement = select(OpenBmcCommand).where(OpenBmcCommand.id == command_id)
    if not settings.is_sqlite:
        statement = statement.with_for_update()
    return session.exec(statement).first()


def _confirmed_actor_still_authorized(session: Session, command: OpenBmcCommand) -> bool:
    if command.confirmed_by_user_id is None:
        return False
    user = session.get(UserAccount, command.confirmed_by_user_id)
    if user is None or not user.is_active:
        return False
    memberships = session.exec(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.is_active.is_(True),
        )
    ).all()
    for membership in memberships:
        if membership.organization_id is None and membership.role in {"platform_admin", "ops"}:
            return True
        if membership.organization_id == command.organization_id and membership.role == "customer_admin":
            return True
    return False


def _expire_connector_commands(
    session: Session,
    settings: Settings,
    connector_id: str,
    *,
    actor_user_id: str | None = None,
) -> int:
    expired = expire_unclaimed_commands(
        session,
        connector_id=connector_id,
        now=utc_now(),
        use_for_update=not settings.is_sqlite,
    )
    for command in expired:
        record_audit(
            session,
            action="openbmc.command.expired",
            organization_id=command.organization_id,
            actor_user_id=actor_user_id,
            target_type="openbmc_command",
            target_id=command.id,
            metadata={
                "connectorId": connector_id,
                "failureCode": command.failure_code,
                "expiredBy": "server_deadline_guard",
            },
        )
    return len(expired)


@router.get("/v1/openbmc/connectors", response_model=OpenBmcConnectorListDto)
def list_openbmc_connectors(
    organizationId: str | None = None,
    siteId: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> OpenBmcConnectorListDto:
    statement = apply_org_read_scope(
        select(OpenBmcConnector).order_by(OpenBmcConnector.created_at.desc()),
        OpenBmcConnector.organization_id,
        current_user,
    )
    if organizationId is not None:
        ensure_org_read_access(
            session,
            current_user,
            organizationId,
            action="openbmc.connector_list_access",
        )
        statement = statement.where(OpenBmcConnector.organization_id == organizationId)
    if siteId is not None:
        statement = statement.where(OpenBmcConnector.site_id == siteId)
    connectors = session.exec(statement).all()
    return OpenBmcConnectorListDto(connectors=[_connector_status(connector) for connector in connectors])


@router.post("/v1/openbmc/connectors", response_model=ProvisionedOpenBmcConnectorDto)
def provision_openbmc_connector(
    request: ProvisionOpenBmcConnectorDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> ProvisionedOpenBmcConnectorDto:
    ensure_org_write_access(
        session,
        current_user,
        request.organizationId,
        action="openbmc.connector_provision_access",
    )
    _site_for_org(session, request.organizationId, request.siteId)
    token = create_openbmc_connector_token()
    connector = OpenBmcConnector(
        organization_id=request.organizationId,
        site_id=request.siteId,
        name=request.name.strip(),
        token_hash=hash_openbmc_connector_token(token),
        version=request.version.strip(),
        created_by_user_id=current_user.user.id,
    )
    session.add(connector)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_connector_already_exists") from exc
    record_audit(
        session,
        action="openbmc.connector.provisioned",
        organization_id=connector.organization_id,
        actor_user_id=current_user.user.id,
        target_type="openbmc_connector",
        target_id=connector.id,
        metadata={"siteId": connector.site_id, "version": connector.version},
    )
    session.commit()
    session.refresh(connector)
    return ProvisionedOpenBmcConnectorDto(
        **_connector_status(connector).model_dump(),
        connectorToken=token,
        connectorTokenWarning="Store this token on the site connector now. The plaintext is not recoverable.",
    )


@router.post(
    "/v1/openbmc/connectors/{connector_id}/token",
    response_model=OpenBmcConnectorTokenDto,
)
def rotate_openbmc_connector_token(
    connector_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> OpenBmcConnectorTokenDto:
    connector = _load_connector_for_web(session, current_user, connector_id, write=True)
    token = create_openbmc_connector_token()
    connector.token_hash = hash_openbmc_connector_token(token)
    connector.updated_at = utc_now()
    session.add(connector)
    record_audit(
        session,
        action="openbmc.connector.token_rotated",
        organization_id=connector.organization_id,
        actor_user_id=current_user.user.id,
        target_type="openbmc_connector",
        target_id=connector.id,
        metadata={"siteId": connector.site_id},
    )
    session.commit()
    return OpenBmcConnectorTokenDto(
        connectorId=connector.id,
        connectorToken=token,
        connectorTokenWarning="Replace the old site token now. The plaintext is not recoverable.",
    )


@router.post(
    "/v1/openbmc/connectors/{connector_id}/revoke",
    response_model=OpenBmcConnectorStatusDto,
)
def revoke_openbmc_connector(
    connector_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> OpenBmcConnectorStatusDto:
    connector = _load_connector_for_web(session, current_user, connector_id, write=True)
    if connector.status == "revoked":
        return _connector_status(connector)
    connector.status = "revoked"
    # Invalidate the old bearer secret even if a future code path accidentally
    # stops checking the status column.
    connector.token_hash = hash_openbmc_connector_token(create_openbmc_connector_token())
    connector.updated_at = utc_now()
    session.add(connector)
    record_audit(
        session,
        action="openbmc.connector.revoked",
        organization_id=connector.organization_id,
        actor_user_id=current_user.user.id,
        target_type="openbmc_connector",
        target_id=connector.id,
        metadata={"siteId": connector.site_id},
    )
    session.commit()
    return _connector_status(connector)


@router.post("/v1/openbmc/devices")
def provision_openbmc_device(
    request: ProvisionOpenBmcDeviceDto,
    settings: Settings = Depends(get_settings),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_org_write_access(
        session,
        current_user,
        request.organizationId,
        action="openbmc.device_provision_access",
    )
    _site_for_org(session, request.organizationId, request.siteId)
    connector = session.get(OpenBmcConnector, request.connectorId)
    if (
        connector is None
        or connector.organization_id != request.organizationId
        or connector.site_id != request.siteId
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_connector_not_found")
    device = OpenBmcDevice(
        organization_id=request.organizationId,
        site_id=request.siteId,
        connector_id=connector.id,
        name=request.name.strip(),
        external_ref=request.externalRef.strip(),
        device_type=request.deviceType,
        capabilities_json=list(request.capabilities),
        created_by_user_id=current_user.user.id,
    )
    session.add(device)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_device_already_exists") from exc
    record_audit(
        session,
        action="openbmc.device.created",
        organization_id=device.organization_id,
        actor_user_id=current_user.user.id,
        target_type="openbmc_device",
        target_id=device.id,
        metadata={
            "siteId": device.site_id,
            "connectorId": device.connector_id,
            "capabilities": device.capabilities_json,
        },
    )
    session.commit()
    session.refresh(device)
    return serialize_device(
        session,
        settings,
        device,
        connector,
        actor_can_control=current_user.can_write_org(device.organization_id),
    )


@router.get("/v1/openbmc/devices")
def list_openbmc_devices(
    organizationId: str | None = None,
    siteId: str | None = None,
    settings: Settings = Depends(get_settings),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    _require_live_view(settings)
    statement = apply_org_read_scope(
        select(OpenBmcDevice).order_by(OpenBmcDevice.created_at.desc()),
        OpenBmcDevice.organization_id,
        current_user,
    )
    if organizationId is not None:
        ensure_org_read_access(
            session,
            current_user,
            organizationId,
            action="openbmc.device_list_access",
        )
        statement = statement.where(OpenBmcDevice.organization_id == organizationId)
    if siteId is not None:
        statement = statement.where(OpenBmcDevice.site_id == siteId)
    devices = session.exec(statement).all()
    connector_ids = {device.connector_id for device in devices}
    expired_count = sum(
        _expire_connector_commands(
            session,
            settings,
            connector_id,
            actor_user_id=current_user.user.id,
        )
        for connector_id in connector_ids
    )
    if expired_count:
        session.commit()
    serialized: list[dict] = []
    for device in devices:
        connector = session.get(OpenBmcConnector, device.connector_id)
        if connector is None:
            continue
        serialized.append(
            serialize_device(
                session,
                settings,
                device,
                connector,
                actor_can_control=current_user.can_write_org(device.organization_id),
            )
        )
    return {"devices": serialized}


@router.get("/v1/openbmc/devices/{device_id}")
def get_openbmc_device(
    device_id: str,
    settings: Settings = Depends(get_settings),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    _require_live_view(settings)
    device, connector = _load_device_for_web(session, current_user, device_id, write=False)
    if _expire_connector_commands(
        session,
        settings,
        connector.id,
        actor_user_id=current_user.user.id,
    ):
        session.commit()
    return serialize_device(
        session,
        settings,
        device,
        connector,
        actor_can_control=current_user.can_write_org(device.organization_id),
    )


@router.get("/v1/openbmc-connector/config", response_model=OpenBmcConnectorConfigDto)
def get_openbmc_connector_config(
    connector: OpenBmcConnector = Depends(get_current_openbmc_connector),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> OpenBmcConnectorConfigDto:
    _require_integration(settings)
    devices = session.exec(
        select(OpenBmcDevice)
        .where(OpenBmcDevice.connector_id == connector.id)
        .order_by(OpenBmcDevice.created_at)
    ).all()
    return OpenBmcConnectorConfigDto(
        connectorId=connector.id,
        organizationId=connector.organization_id,
        siteId=connector.site_id,
        pollIntervalSeconds=5,
        commandClaimIntervalSeconds=2,
        devices=[
            OpenBmcConnectorConfigDeviceDto(
                deviceId=device.id,
                externalRef=device.external_ref,
                deviceType=device.device_type,
                status=device.status,
                capabilities=device.capabilities_json,
            )
            for device in devices
        ],
    )


@router.post("/v1/openbmc-connector/heartbeat", response_model=OpenBmcHeartbeatResponseDto)
def heartbeat_openbmc_connector(
    request: OpenBmcHeartbeatRequestDto,
    connector: OpenBmcConnector = Depends(get_current_openbmc_connector),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> OpenBmcHeartbeatResponseDto:
    _require_integration(settings)
    received_at = utc_now()
    connector.version = request.version.strip()
    connector.last_error_code = request.lastErrorCode
    connector.last_heartbeat_at = received_at
    connector.updated_at = received_at
    session.add(connector)
    session.commit()
    return OpenBmcHeartbeatResponseDto(
        connectorId=connector.id,
        status=connector.status,
        receivedAt=received_at,
    )


@router.post(
    "/v1/openbmc-connector/observations",
    response_model=OpenBmcObservationIngestResponseDto,
)
def ingest_openbmc_observation(
    request: OpenBmcObservationRequestDto,
    connector: OpenBmcConnector = Depends(get_current_openbmc_connector),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> OpenBmcObservationIngestResponseDto:
    _require_integration(settings)
    device = _load_connector_device(session, connector, request.deviceId)
    now = utc_now()
    if as_utc(request.observedAt) > now + timedelta(seconds=settings.openbmc_clock_skew_seconds):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="observed_at_too_far_in_future")
    if as_utc(request.collectorReceivedAt) > now + timedelta(seconds=settings.openbmc_clock_skew_seconds):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="collector_received_at_too_far_in_future",
        )
    duplicate = session.exec(
        select(OpenBmcTelemetryObservation).where(
            OpenBmcTelemetryObservation.device_id == device.id,
            OpenBmcTelemetryObservation.source_observation_id == request.sourceObservationId,
        )
    ).first()
    if duplicate is not None:
        if not _observation_matches(duplicate, request):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="source_observation_id_reused_with_different_payload",
            )
        return OpenBmcObservationIngestResponseDto(
            observationId=duplicate.id,
            deviceId=device.id,
            duplicate=True,
            ingestedAt=as_utc(duplicate.ingested_at),
        )
    observation = OpenBmcTelemetryObservation(
        device_id=device.id,
        organization_id=device.organization_id,
        site_id=device.site_id,
        source_observation_id=request.sourceObservationId,
        observed_at=as_utc(request.observedAt),
        collector_received_at=as_utc(request.collectorReceivedAt),
        ingested_at=now,
        collector_stale=request.collectorStale,
        temperature_c=request.temperatureC,
        status=request.status,
        health=request.health,
        fan_json=request.fan.model_dump(),
        thresholds_json=request.thresholds.model_dump(),
        raw_schema_version=request.schemaVersion,
    )
    session.add(observation)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        duplicate = session.exec(
            select(OpenBmcTelemetryObservation).where(
                OpenBmcTelemetryObservation.device_id == device.id,
                OpenBmcTelemetryObservation.source_observation_id == request.sourceObservationId,
            )
        ).first()
        if duplicate is None:
            raise
        if not _observation_matches(duplicate, request):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="source_observation_id_reused_with_different_payload",
            )
        return OpenBmcObservationIngestResponseDto(
            observationId=duplicate.id,
            deviceId=device.id,
            duplicate=True,
            ingestedAt=as_utc(duplicate.ingested_at),
        )
    if device.last_observed_at is None or as_utc(observation.observed_at) >= as_utc(device.last_observed_at):
        device.last_observed_at = observation.observed_at
    device.last_ingested_at = now
    device.updated_at = now
    connector.last_observation_at = now
    connector.updated_at = now
    session.add(device)
    session.add(connector)
    session.commit()
    return OpenBmcObservationIngestResponseDto(
        observationId=observation.id,
        deviceId=device.id,
        duplicate=False,
        ingestedAt=as_utc(observation.ingested_at),
    )


@router.post(
    "/v1/openbmc-connector/events:batch",
    response_model=OpenBmcEventBatchResponseDto,
)
def ingest_openbmc_events(
    request: OpenBmcEventBatchRequestDto,
    connector: OpenBmcConnector = Depends(get_current_openbmc_connector),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> OpenBmcEventBatchResponseDto:
    _require_integration(settings)
    device = _load_connector_device(session, connector, request.deviceId)
    now = utc_now()
    accepted = 0
    duplicates = 0
    for item in request.events:
        if as_utc(item.occurredAt) > now + timedelta(seconds=settings.openbmc_clock_skew_seconds):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="event_time_too_far_in_future")
        assert_json_size(item.details)
        existing = session.exec(
            select(OpenBmcEventRecord).where(
                OpenBmcEventRecord.device_id == device.id,
                OpenBmcEventRecord.source_event_key == item.sourceEventKey,
            )
        ).first()
        if existing is not None:
            if not _event_matches(existing, item):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="source_event_key_reused_with_different_payload",
                )
            duplicates += 1
            continue
        session.add(
            OpenBmcEventRecord(
                device_id=device.id,
                organization_id=device.organization_id,
                site_id=device.site_id,
                source_event_key=item.sourceEventKey,
                occurred_at=as_utc(item.occurredAt),
                severity=item.severity,
                source=item.source.strip(),
                code=item.code.strip(),
                message=item.message,
                details_json=item.details,
                ingested_at=now,
            )
        )
        accepted += 1
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_event_batch_conflict") from exc
    return OpenBmcEventBatchResponseDto(accepted=accepted, duplicates=duplicates, receivedAt=now)


def _observation_matches(
    stored: OpenBmcTelemetryObservation,
    request: OpenBmcObservationRequestDto,
) -> bool:
    return (
        as_utc(stored.observed_at) == as_utc(request.observedAt)
        and as_utc(stored.collector_received_at) == as_utc(request.collectorReceivedAt)
        and stored.collector_stale == request.collectorStale
        and stored.temperature_c == request.temperatureC
        and stored.status == request.status
        and stored.health == request.health
        and stored.fan_json == request.fan.model_dump()
        and stored.thresholds_json == request.thresholds.model_dump()
        and stored.raw_schema_version == request.schemaVersion
    )


def _event_matches(stored: OpenBmcEventRecord, request: OpenBmcEventItemDto) -> bool:
    return (
        as_utc(stored.occurred_at) == as_utc(request.occurredAt)
        and stored.severity == request.severity
        and stored.source == request.source.strip()
        and stored.code == request.code.strip()
        and stored.message == request.message
        and stored.details_json == request.details
    )


@router.post(
    "/v1/openbmc/devices/{device_id}/command-proposals",
    response_model=OpenBmcCommandProposalResponseDto,
)
def propose_openbmc_command(
    device_id: str,
    request: OpenBmcCommandProposalRequestDto,
    settings: Settings = Depends(get_settings),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> OpenBmcCommandProposalResponseDto:
    device, connector = _load_device_for_web(session, current_user, device_id, write=True)
    if _expire_connector_commands(
        session,
        settings,
        connector.id,
        actor_user_id=current_user.user.id,
    ):
        session.commit()
    arguments = normalize_command(request.command.type, request.command.arguments)
    assert_command_guards(
        session=session,
        settings=settings,
        connector=connector,
        device=device,
        command_type=request.command.type,
        require_execution_enabled=False,
    )
    if request.idempotencyKey is not None:
        existing = session.exec(
            select(OpenBmcCommand).where(
                OpenBmcCommand.organization_id == device.organization_id,
                OpenBmcCommand.proposed_by_user_id == current_user.user.id,
                OpenBmcCommand.request_idempotency_key == request.idempotencyKey,
            )
        ).first()
        if existing is not None:
            if (
                existing.device_id != device.id
                or existing.command_type != request.command.type
                or existing.arguments_json != arguments
                or existing.reason != request.reason.strip()
            ):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="idempotency_key_reused")
            return OpenBmcCommandProposalResponseDto(
                commandId=existing.id,
                status=existing.status,
                proposalHash=existing.proposal_hash,
                confirmationExpiresAt=as_utc(existing.confirmation_expires_at),
                summary=command_human_summary(existing.command_type, existing.arguments_json, device.name),
            )
    now = utc_now()
    confirmation_expires_at = now + timedelta(seconds=settings.openbmc_confirmation_ttl_seconds)
    reason = request.reason.strip()
    proposal_hash = canonical_proposal_hash(
        device_id=device.id,
        command_type=request.command.type,
        arguments=arguments,
        reason=reason,
        confirmation_expires_at=confirmation_expires_at,
    )
    command = OpenBmcCommand(
        device_id=device.id,
        connector_id=connector.id,
        organization_id=device.organization_id,
        site_id=device.site_id,
        command_type=request.command.type,
        arguments_json=arguments,
        reason=reason,
        request_idempotency_key=request.idempotencyKey,
        proposal_hash=proposal_hash,
        proposed_by_user_id=current_user.user.id,
        proposed_at=now,
        confirmation_expires_at=confirmation_expires_at,
        created_at=now,
        updated_at=now,
    )
    session.add(command)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_proposal_conflict") from exc
    record_audit(
        session,
        action="openbmc.command.proposed",
        organization_id=command.organization_id,
        actor_user_id=current_user.user.id,
        target_type="openbmc_command",
        target_id=command.id,
        metadata={
            "deviceId": device.id,
            "commandType": command.command_type,
            "arguments": command.arguments_json,
            "proposalHash": command.proposal_hash,
        },
    )
    session.commit()
    return OpenBmcCommandProposalResponseDto(
        commandId=command.id,
        status=command.status,
        proposalHash=command.proposal_hash,
        confirmationExpiresAt=as_utc(command.confirmation_expires_at),
        summary=command_human_summary(command.command_type, command.arguments_json, device.name),
    )


@router.post("/v1/openbmc/commands/{command_id}/confirm")
def confirm_openbmc_command(
    command_id: str,
    request: OpenBmcCommandConfirmRequestDto,
    settings: Settings = Depends(get_settings),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    initial_command = session.get(OpenBmcCommand, command_id)
    if initial_command is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_command_not_found")
    ensure_org_write_access(
        session,
        current_user,
        initial_command.organization_id,
        action="openbmc.command_confirm_access",
    )
    if _expire_connector_commands(
        session,
        settings,
        initial_command.connector_id,
        actor_user_id=current_user.user.id,
    ):
        session.commit()
    command = _load_command_for_update(session, settings, command_id)
    if command is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_command_not_found")
    if command.status != "awaiting_confirmation":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_not_awaiting_confirmation")
    if not hmac.compare_digest(command.proposal_hash, request.expectedProposalHash):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_proposal_hash_mismatch")
    now = utc_now()
    if as_utc(command.confirmation_expires_at) <= now:
        command.status = "expired"
        command.completed_at = now
        command.failure_code = "confirmation_expired"
        command.updated_at = now
        session.add(command)
        record_audit(
            session,
            action="openbmc.command.expired",
            organization_id=command.organization_id,
            actor_user_id=current_user.user.id,
            target_type="openbmc_command",
            target_id=command.id,
            metadata={"failureCode": command.failure_code},
        )
        session.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_confirmation_expired")
    device = session.get(OpenBmcDevice, command.device_id)
    connector = session.get(OpenBmcConnector, command.connector_id)
    if device is None or connector is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_binding_invalid")
    assert_command_guards(
        session=session,
        settings=settings,
        connector=connector,
        device=device,
        command_type=command.command_type,
        require_execution_enabled=True,
    )
    active = session.exec(
        select(OpenBmcCommand).where(
            OpenBmcCommand.device_id == command.device_id,
            OpenBmcCommand.status.in_(list(OPENBMC_ACTIVE_COMMAND_STATUSES)),
        )
    ).first()
    if active is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_device_has_active_command")
    command.status = "queued"
    command.active_slot = True
    command.confirmed_by_user_id = current_user.user.id
    command.confirmed_at = now
    command.execution_expires_at = now + timedelta(seconds=settings.openbmc_execution_ttl_seconds)
    command.updated_at = now
    session.add(command)
    record_audit(
        session,
        action="openbmc.command.confirmed",
        organization_id=command.organization_id,
        actor_user_id=current_user.user.id,
        target_type="openbmc_command",
        target_id=command.id,
        metadata={
            "deviceId": command.device_id,
            "commandType": command.command_type,
            "proposalHash": command.proposal_hash,
            "executionExpiresAt": command.execution_expires_at.isoformat(),
        },
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_device_has_active_command") from exc
    return command_summary(command)


@router.post("/v1/openbmc/commands/{command_id}/cancel")
def cancel_openbmc_command(
    command_id: str,
    settings: Settings = Depends(get_settings),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> dict:
    initial_command = session.get(OpenBmcCommand, command_id)
    if initial_command is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_command_not_found")
    ensure_org_write_access(
        session,
        current_user,
        initial_command.organization_id,
        action="openbmc.command_cancel_access",
    )
    if _expire_connector_commands(
        session,
        settings,
        initial_command.connector_id,
        actor_user_id=current_user.user.id,
    ):
        session.commit()
    command = _load_command_for_update(session, settings, command_id)
    if command is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_command_not_found")
    if command.status not in {"awaiting_confirmation", "queued"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_cannot_be_cancelled")
    command.status = "cancelled"
    command.active_slot = None
    command.completed_at = utc_now()
    command.failure_code = "cancelled_by_user"
    command.updated_at = command.completed_at
    session.add(command)
    record_audit(
        session,
        action="openbmc.command.cancelled",
        organization_id=command.organization_id,
        actor_user_id=current_user.user.id,
        target_type="openbmc_command",
        target_id=command.id,
        metadata={"previousState": "awaiting_confirmation_or_queued"},
    )
    session.commit()
    return command_summary(command)


@router.post(
    "/v1/openbmc-connector/commands:claim",
    response_model=OpenBmcCommandClaimResponseDto,
)
def claim_openbmc_command(
    connector: OpenBmcConnector = Depends(get_current_openbmc_connector),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> OpenBmcCommandClaimResponseDto:
    _require_integration(settings)
    if not settings.openbmc_command_execution_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="openbmc_command_execution_disabled")
    now = utc_now()
    _expire_connector_commands(session, settings, connector.id)
    statement = (
        select(OpenBmcCommand)
        .where(
            OpenBmcCommand.connector_id == connector.id,
            OpenBmcCommand.status == "queued",
        )
        .order_by(OpenBmcCommand.confirmed_at, OpenBmcCommand.created_at)
        .limit(1)
    )
    if not settings.is_sqlite:
        statement = statement.with_for_update(skip_locked=True)
    command = session.exec(statement).first()
    if command is None:
        session.commit()
        return OpenBmcCommandClaimResponseDto(command=None)
    device = _load_connector_device(session, connector, command.device_id)
    if not _confirmed_actor_still_authorized(session, command):
        command.status = "rejected"
        command.active_slot = None
        command.failure_code = "confirmation_authority_revoked"
        command.completed_at = now
        command.updated_at = now
        session.add(command)
        record_audit(
            session,
            action="openbmc.command.rejected",
            organization_id=command.organization_id,
            target_type="openbmc_command",
            target_id=command.id,
            metadata={
                "connectorId": connector.id,
                "failureCode": command.failure_code,
                "confirmedByUserId": command.confirmed_by_user_id,
            },
        )
        session.commit()
        return OpenBmcCommandClaimResponseDto(command=None)
    try:
        assert_command_guards(
            session=session,
            settings=settings,
            connector=connector,
            device=device,
            command_type=command.command_type,
            require_execution_enabled=True,
        )
    except HTTPException as exc:
        command.status = "rejected"
        command.active_slot = None
        command.failure_code = "claim_guard_failed"
        command.completed_at = now
        command.updated_at = now
        session.add(command)
        record_audit(
            session,
            action="openbmc.command.rejected",
            organization_id=command.organization_id,
            target_type="openbmc_command",
            target_id=command.id,
            metadata={"connectorId": connector.id, "guard": str(exc.detail)},
        )
        session.commit()
        return OpenBmcCommandClaimResponseDto(command=None)
    lease = create_openbmc_command_lease()
    command.status = "claimed"
    command.claim_lease_hash = hash_openbmc_command_lease(lease)
    command.claim_expires_at = now + timedelta(seconds=settings.openbmc_claim_lease_seconds)
    command.updated_at = now
    session.add(command)
    record_audit(
        session,
        action="openbmc.command.claimed",
        organization_id=command.organization_id,
        target_type="openbmc_command",
        target_id=command.id,
        metadata={
            "connectorId": connector.id,
            "deviceId": command.device_id,
            "leaseExpiresAt": command.claim_expires_at.isoformat(),
        },
    )
    session.commit()
    return OpenBmcCommandClaimResponseDto(
        command=OpenBmcCommandClaimDto(
            commandId=command.id,
            leaseId=lease,
            leaseExpiresAt=as_utc(command.claim_expires_at),
            deviceId=command.device_id,
            command=OpenBmcCommandSpecDto(type=command.command_type, arguments=command.arguments_json),
            idempotencyKey=command.id,
        )
    )


def _load_leased_command(
    session: Session,
    settings: Settings,
    connector: OpenBmcConnector,
    command_id: str,
    lease_id: str,
) -> OpenBmcCommand:
    command = _load_command_for_update(session, settings, command_id)
    if (
        command is None
        or command.connector_id != connector.id
        or command.organization_id != connector.organization_id
        or command.site_id != connector.site_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="openbmc_command_not_found")
    if command.claim_lease_hash is None or not hmac.compare_digest(
        command.claim_lease_hash,
        hash_openbmc_command_lease(lease_id),
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_lease_mismatch")
    return command


def _assert_live_lease(session: Session, command: OpenBmcCommand, now: datetime) -> None:
    if command.claim_expires_at is not None and as_utc(command.claim_expires_at) <= now:
        if command.status not in OPENBMC_TERMINAL_COMMAND_STATUSES:
            command.status = "expired"
            command.active_slot = None
            command.failure_code = "claim_lease_expired"
            command.completed_at = now
            command.updated_at = now
            session.add(command)
            record_audit(
                session,
                action="openbmc.command.expired",
                organization_id=command.organization_id,
                target_type="openbmc_command",
                target_id=command.id,
                metadata={"failureCode": command.failure_code},
            )
            session.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_lease_expired")


@router.post("/v1/openbmc-connector/commands/{command_id}/progress")
def progress_openbmc_command(
    command_id: str,
    request: OpenBmcCommandProgressRequestDto,
    connector: OpenBmcConnector = Depends(get_current_openbmc_connector),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> dict:
    _require_integration(settings)
    command = _load_leased_command(session, settings, connector, command_id, request.leaseId)
    now = utc_now()
    _assert_live_lease(session, command, now)
    allowed = {
        "claimed": "accepted_by_collector",
        "accepted_by_collector": "delivered_to_agent",
    }
    if command.status == request.status:
        if request.localCommandId != command.local_command_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="openbmc_progress_payload_conflict",
            )
        return command_summary(command)
    if allowed.get(command.status) != request.status:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_progress_transition_invalid")
    if command.local_command_id and request.localCommandId and command.local_command_id != request.localCommandId:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_local_command_id_mismatch")
    previous = command.status
    command.status = request.status
    command.local_command_id = request.localCommandId or command.local_command_id
    command.updated_at = now
    session.add(command)
    record_audit(
        session,
        action="openbmc.command.progressed",
        organization_id=command.organization_id,
        target_type="openbmc_command",
        target_id=command.id,
        metadata={
            "connectorId": connector.id,
            "from": previous,
            "to": command.status,
            "localCommandId": command.local_command_id,
        },
    )
    session.commit()
    return command_summary(command)


@router.post("/v1/openbmc-connector/commands/{command_id}/result")
def finish_openbmc_command(
    command_id: str,
    request: OpenBmcCommandResultRequestDto,
    connector: OpenBmcConnector = Depends(get_current_openbmc_connector),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> dict:
    _require_integration(settings)
    command = _load_leased_command(session, settings, connector, command_id, request.leaseId)
    now = utc_now()
    if command.status in {"succeeded", "failed"}:
        if command.status != request.status:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_terminal_result_conflict")
        if (
            command.local_command_id != request.localCommandId
            or command.failure_code != request.failureCode
            or command.result_json != request.result
            or command.completed_at is None
            or as_utc(command.completed_at) != as_utc(request.finishedAt)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="openbmc_terminal_result_payload_conflict",
            )
        return command_summary(command)
    _assert_live_lease(session, command, now)
    if command.status not in {"claimed", "accepted_by_collector", "delivered_to_agent"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_result_transition_invalid")
    if as_utc(request.finishedAt) > now + timedelta(seconds=settings.openbmc_clock_skew_seconds):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="finished_at_too_far_in_future")
    if request.status == "succeeded":
        if command.status != "delivered_to_agent":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="openbmc_success_requires_agent_delivery",
            )
        if (
            not command.local_command_id
            or not request.localCommandId
            or command.local_command_id != request.localCommandId
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="openbmc_success_requires_exact_local_command_id",
            )
    elif command.local_command_id and request.localCommandId and command.local_command_id != request.localCommandId:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_local_command_id_mismatch")
    if request.status == "failed" and not request.failureCode:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="failure_code_required")
    if request.status == "succeeded" and request.failureCode:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="failure_code_not_allowed")
    assert_json_size(request.result)
    command.status = request.status
    command.active_slot = None
    command.local_command_id = request.localCommandId or command.local_command_id
    command.result_json = request.result
    command.failure_code = request.failureCode
    command.completed_at = as_utc(request.finishedAt)
    command.updated_at = now
    session.add(command)
    record_audit(
        session,
        action=f"openbmc.command.{request.status}",
        organization_id=command.organization_id,
        target_type="openbmc_command",
        target_id=command.id,
        metadata={
            "connectorId": connector.id,
            "deviceId": command.device_id,
            "commandType": command.command_type,
            "localCommandId": command.local_command_id,
            "failureCode": command.failure_code,
        },
    )
    session.commit()
    return command_summary(command)
