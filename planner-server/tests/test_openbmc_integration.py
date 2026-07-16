from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json

from sqlmodel import select

from app.models import (
    AuditEvent,
    OpenBmcCommand,
    OpenBmcEventRecord,
    OpenBmcTelemetryObservation,
    OrganizationMembership,
)
from tests.helpers import login_web, seed_organization, seed_site, seed_user


PASSWORD = "OpenBmc-test-password-123!"


def _enable_openbmc(app, *, commands: bool = True) -> None:
    app.state.settings = replace(
        app.state.settings,
        openbmc_integration_enabled=True,
        openbmc_live_view_enabled=True,
        openbmc_command_proposals_enabled=commands,
        openbmc_command_execution_enabled=commands,
    )


def _seed_admin(session_factory, *, email: str = "admin@openbmc.test"):
    with session_factory() as session:
        organization = seed_organization(session, name=f"OpenBMC {email}")
        site = seed_site(session, organization_id=organization.id, name="Pi5 Lab")
        user = seed_user(
            session,
            email=email,
            password=PASSWORD,
            org_roles=[(organization.id, "customer_admin")],
        )
        session.commit()
        return organization.id, site.id, user.id


def _provision(
    client,
    headers: dict[str, str],
    *,
    organization_id: str,
    site_id: str,
    suffix: str = "a",
):
    connector_response = client.post(
        "/v1/openbmc/connectors",
        headers=headers,
        json={
            "organizationId": organization_id,
            "siteId": site_id,
            "name": f"site-connector-{suffix}",
            "version": "test-1.0",
        },
    )
    assert connector_response.status_code == 200, connector_response.text
    connector = connector_response.json()
    token_headers = {"Authorization": f"Bearer {connector['connectorToken']}"}
    device_response = client.post(
        "/v1/openbmc/devices",
        headers=headers,
        json={
            "organizationId": organization_id,
            "siteId": site_id,
            "connectorId": connector["connectorId"],
            "name": f"Pi5 OpenBMC {suffix}",
            "externalRef": f"pi5-{suffix}",
            "deviceType": "raspberry_pi_5",
            "capabilities": ["fan_boost", "reset_dry_run"],
        },
    )
    assert device_response.status_code == 200, device_response.text
    return connector, device_response.json(), token_headers


def _heartbeat(client, connector_headers: dict[str, str]) -> None:
    response = client.post(
        "/v1/openbmc-connector/heartbeat",
        headers=connector_headers,
        json={"version": "connector-test-1.0", "lastErrorCode": None},
    )
    assert response.status_code == 200, response.text


def _observation_payload(device_id: str, *, source_id: str = "collector-a:1", age_seconds: int = 0) -> dict:
    observed_at = datetime.now(timezone.utc) - timedelta(seconds=age_seconds)
    return {
        "schemaVersion": "openbmc-observation.v1",
        "deviceId": device_id,
        "sourceObservationId": source_id,
        "observedAt": observed_at.isoformat(),
        "collectorReceivedAt": (observed_at + timedelta(milliseconds=200)).isoformat(),
        "collectorStale": False,
        "temperatureC": 52.4,
        "status": "normal",
        "health": "ok",
        "fan": {
            "present": True,
            "rpm": 1180,
            "pwm": 75,
            "coolingState": 1,
            "coolingMaxState": 4,
            "manualBoostSupported": True,
        },
        "thresholds": {"warningC": 65, "criticalC": 75},
    }


def _ingest_fresh(client, connector_headers: dict[str, str], device_id: str) -> None:
    _heartbeat(client, connector_headers)
    response = client.post(
        "/v1/openbmc-connector/observations",
        headers=connector_headers,
        json=_observation_payload(device_id),
    )
    assert response.status_code == 200, response.text


def _assert_timestamp_has_offset(value: str) -> None:
    assert value.endswith("Z") or (
        len(value) >= 6
        and value[-6] in {"+", "-"}
        and value[-3] == ":"
    ), value


def test_connector_token_binding_org_isolation_and_rotation(client, app, session_factory) -> None:
    _enable_openbmc(app)
    org_a, site_a, _ = _seed_admin(session_factory, email="admin-a@openbmc.test")
    org_b, site_b, _ = _seed_admin(session_factory, email="admin-b@openbmc.test")
    with session_factory() as session:
        seed_user(
            session,
            email="viewer-a@openbmc.test",
            password=PASSWORD,
            org_roles=[(org_a, "customer_viewer")],
        )
        session.commit()
    headers_a, _ = login_web(client, email="admin-a@openbmc.test", password=PASSWORD)
    headers_b, _ = login_web(client, email="admin-b@openbmc.test", password=PASSWORD)
    viewer_headers, _ = login_web(client, email="viewer-a@openbmc.test", password=PASSWORD)
    connector_a, device_a, token_a = _provision(
        client,
        headers_a,
        organization_id=org_a,
        site_id=site_a,
        suffix="a",
    )
    _, device_b, token_b = _provision(
        client,
        headers_b,
        organization_id=org_b,
        site_id=site_b,
        suffix="b",
    )

    list_a = client.get("/v1/openbmc/devices", headers=headers_a)
    assert list_a.status_code == 200
    assert [device["deviceId"] for device in list_a.json()["devices"]] == [device_a["deviceId"]]
    assert client.get(f"/v1/openbmc/devices/{device_b['deviceId']}", headers=headers_a).status_code == 403

    _heartbeat(client, token_a)
    fresh = client.post(
        "/v1/openbmc-connector/observations",
        headers=token_a,
        json=_observation_payload(device_a["deviceId"]),
    )
    assert fresh.status_code == 200
    admin_detail = client.get(f"/v1/openbmc/devices/{device_a['deviceId']}", headers=headers_a)
    viewer_detail = client.get(f"/v1/openbmc/devices/{device_a['deviceId']}", headers=viewer_headers)
    assert admin_detail.status_code == viewer_detail.status_code == 200
    assert admin_detail.json()["canControl"] is True
    assert admin_detail.json()["controlEligible"] is True
    assert viewer_detail.json()["canControl"] is False
    assert viewer_detail.json()["controlEligible"] is False
    assert "insufficient_write_role" in viewer_detail.json()["controlBlockReasons"]

    cross_binding = client.post(
        "/v1/openbmc-connector/observations",
        headers=token_a,
        json=_observation_payload(device_b["deviceId"]),
    )
    assert cross_binding.status_code == 404
    assert client.post(
        "/v1/openbmc-connector/observations",
        headers=token_b,
        json=_observation_payload(device_a["deviceId"]),
    ).status_code == 404

    rotated = client.post(
        f"/v1/openbmc/connectors/{connector_a['connectorId']}/token",
        headers=headers_a,
    )
    assert rotated.status_code == 200
    assert client.get("/v1/openbmc-connector/config", headers=token_a).status_code == 401
    new_token_headers = {"Authorization": f"Bearer {rotated.json()['connectorToken']}"}
    assert client.get("/v1/openbmc-connector/config", headers=new_token_headers).status_code == 200
    revoked = client.post(
        f"/v1/openbmc/connectors/{connector_a['connectorId']}/revoke",
        headers=headers_a,
    )
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoked"
    assert client.get("/v1/openbmc-connector/config", headers=new_token_headers).status_code == 401


def test_observation_and_event_ingest_are_idempotent(client, app, session_factory) -> None:
    _enable_openbmc(app)
    org_id, site_id, _ = _seed_admin(session_factory, email="idempotent@openbmc.test")
    headers, _ = login_web(client, email="idempotent@openbmc.test", password=PASSWORD)
    _, device, connector_headers = _provision(
        client,
        headers,
        organization_id=org_id,
        site_id=site_id,
        suffix="idem",
    )
    _heartbeat(client, connector_headers)
    payload = _observation_payload(device["deviceId"], source_id="collector-idem:42")
    first = client.post("/v1/openbmc-connector/observations", headers=connector_headers, json=payload)
    second = client.post("/v1/openbmc-connector/observations", headers=connector_headers, json=payload)
    assert first.status_code == second.status_code == 200
    assert first.json()["duplicate"] is False
    assert second.json()["duplicate"] is True
    assert second.json()["observationId"] == first.json()["observationId"]
    changed_payload = {**payload, "temperatureC": 53.4}
    conflict = client.post(
        "/v1/openbmc-connector/observations",
        headers=connector_headers,
        json=changed_payload,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "source_observation_id_reused_with_different_payload"

    event_payload = {
        "schemaVersion": "openbmc-events.v1",
        "deviceId": device["deviceId"],
        "events": [
            {
                "sourceEventKey": "collector-idem:event:7",
                "occurredAt": datetime.now(timezone.utc).isoformat(),
                "severity": "warning",
                "source": "pi5-agent",
                "code": "temperature_warning",
                "message": "Temperature crossed the warning threshold.",
                "details": {"temperatureC": 67.1},
            }
        ],
    }
    event_first = client.post("/v1/openbmc-connector/events:batch", headers=connector_headers, json=event_payload)
    event_second = client.post("/v1/openbmc-connector/events:batch", headers=connector_headers, json=event_payload)
    assert event_first.json()["accepted"] == 1
    assert event_second.json()["accepted"] == 0
    assert event_second.json()["duplicates"] == 1
    event_payload["events"][0]["message"] = "Different event payload"
    event_conflict = client.post(
        "/v1/openbmc-connector/events:batch",
        headers=connector_headers,
        json=event_payload,
    )
    assert event_conflict.status_code == 409
    assert event_conflict.json()["detail"] == "source_event_key_reused_with_different_payload"
    invalid_json_event = {
        **event_payload,
        "events": [
            {
                **event_payload["events"][0],
                "sourceEventKey": "collector-idem:event:nan",
                "details": {"temperatureC": float("nan")},
            }
        ],
    }
    invalid_json = client.post(
        "/v1/openbmc-connector/events:batch",
        headers={**connector_headers, "Content-Type": "application/json"},
        content=json.dumps(invalid_json_event, allow_nan=True),
    )
    assert invalid_json.status_code == 422
    assert invalid_json.json()["detail"] == "invalid_json_value"

    with session_factory() as session:
        observations = session.exec(select(OpenBmcTelemetryObservation)).all()
        events = session.exec(select(OpenBmcEventRecord)).all()
    assert len(observations) == 1
    assert len(events) == 1


def test_read_path_marks_stale_and_default_command_flags_fail_closed(client, app, session_factory) -> None:
    app.state.settings = replace(
        app.state.settings,
        openbmc_integration_enabled=True,
        openbmc_live_view_enabled=True,
        openbmc_command_proposals_enabled=False,
        openbmc_command_execution_enabled=False,
    )
    org_id, site_id, _ = _seed_admin(session_factory, email="stale@openbmc.test")
    headers, _ = login_web(client, email="stale@openbmc.test", password=PASSWORD)
    _, device, connector_headers = _provision(
        client,
        headers,
        organization_id=org_id,
        site_id=site_id,
        suffix="stale",
    )
    _heartbeat(client, connector_headers)
    old = client.post(
        "/v1/openbmc-connector/observations",
        headers=connector_headers,
        json=_observation_payload(device["deviceId"], age_seconds=31),
    )
    assert old.status_code == 200
    detail = client.get(f"/v1/openbmc/devices/{device['deviceId']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["freshness"] == "stale"
    assert "source_observation_stale" in detail.json()["controlBlockReasons"]
    assert "collector_received_stale" in detail.json()["controlBlockReasons"]
    assert detail.json()["latestObservation"]["temperatureC"] == 52.4

    proposal = client.post(
        f"/v1/openbmc/devices/{device['deviceId']}/command-proposals",
        headers=headers,
        json={
            "command": {"type": "fan_boost", "arguments": {"seconds": 10}},
            "reason": "Verify fail-closed defaults",
        },
    )
    assert proposal.status_code == 403
    assert proposal.json()["detail"] == "openbmc_command_proposals_disabled"

    app.state.settings = replace(app.state.settings, openbmc_live_view_enabled=False)
    hidden = client.get(f"/v1/openbmc/devices/{device['deviceId']}", headers=headers)
    assert hidden.status_code == 403
    assert hidden.json()["detail"] == "openbmc_live_view_disabled"


def test_live_view_flag_is_a_global_kill_switch_for_internal_roles(
    client,
    app,
    session_factory,
) -> None:
    app.state.settings = replace(
        app.state.settings,
        openbmc_integration_enabled=True,
        openbmc_live_view_enabled=False,
    )
    with session_factory() as session:
        seed_user(
            session,
            email="platform-openbmc@test.dev",
            password=PASSWORD,
            global_roles=["platform_admin"],
        )
        seed_user(
            session,
            email="ops-openbmc@test.dev",
            password=PASSWORD,
            global_roles=["ops"],
        )
        session.commit()

    for email in ("platform-openbmc@test.dev", "ops-openbmc@test.dev"):
        headers, _ = login_web(client, email=email, password=PASSWORD)
        response = client.get("/v1/openbmc/devices", headers=headers)
        assert response.status_code == 403
        assert response.json()["detail"] == "openbmc_live_view_disabled"


def test_command_proposal_hash_idempotency_claim_progress_and_terminal_result(
    client,
    app,
    session_factory,
) -> None:
    _enable_openbmc(app)
    org_id, site_id, _ = _seed_admin(session_factory, email="commands@openbmc.test")
    headers, _ = login_web(client, email="commands@openbmc.test", password=PASSWORD)
    _, device, connector_headers = _provision(
        client,
        headers,
        organization_id=org_id,
        site_id=site_id,
        suffix="command",
    )
    _ingest_fresh(client, connector_headers, device["deviceId"])
    proposal_payload = {
        "command": {"type": "fan_boost", "arguments": {"seconds": 10}},
        "reason": "Wiwynn product demonstration",
        "idempotencyKey": "fan-demo-0001",
    }
    proposed = client.post(
        f"/v1/openbmc/devices/{device['deviceId']}/command-proposals",
        headers=headers,
        json=proposal_payload,
    )
    repeated = client.post(
        f"/v1/openbmc/devices/{device['deviceId']}/command-proposals",
        headers=headers,
        json=proposal_payload,
    )
    assert proposed.status_code == repeated.status_code == 200
    assert proposed.json()["commandId"] == repeated.json()["commandId"]
    assert proposed.json()["proposalHash"] == repeated.json()["proposalHash"]

    wrong_hash = client.post(
        f"/v1/openbmc/commands/{proposed.json()['commandId']}/confirm",
        headers=headers,
        json={"expectedProposalHash": "0" * 64},
    )
    assert wrong_hash.status_code == 409
    confirmed = client.post(
        f"/v1/openbmc/commands/{proposed.json()['commandId']}/confirm",
        headers=headers,
        json={"expectedProposalHash": proposed.json()["proposalHash"]},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "queued"

    claimed = client.post("/v1/openbmc-connector/commands:claim", headers=connector_headers)
    assert claimed.status_code == 200, claimed.text
    claim = claimed.json()["command"]
    assert claim["command"]["type"] == "fan_boost"
    assert claim["command"]["arguments"] == {"seconds": 10}
    progress = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/progress",
        headers=connector_headers,
        json={
            "leaseId": claim["leaseId"],
            "status": "accepted_by_collector",
            "localCommandId": "collector-command-7",
        },
    )
    assert progress.status_code == 200
    delivered = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/progress",
        headers=connector_headers,
        json={
            "leaseId": claim["leaseId"],
            "status": "delivered_to_agent",
            "localCommandId": "collector-command-7",
        },
    )
    assert delivered.status_code == 200
    assert delivered.json()["status"] == "delivered_to_agent"

    nan_result = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/result",
        headers={**connector_headers, "Content-Type": "application/json"},
        content=json.dumps(
            {
                "leaseId": claim["leaseId"],
                "status": "succeeded",
                "finishedAt": datetime.now(timezone.utc).isoformat(),
                "localCommandId": "collector-command-7",
                "failureCode": None,
                "result": {"durationSeconds": float("nan")},
            },
            allow_nan=True,
        ),
    )
    assert nan_result.status_code == 422
    assert nan_result.json()["detail"] == "invalid_json_value"

    result_payload = {
        "leaseId": claim["leaseId"],
        "status": "succeeded",
        "finishedAt": datetime.now(timezone.utc).isoformat(),
        "localCommandId": "collector-command-7",
        "failureCode": None,
        "result": {"effect": "fan_boost_completed", "durationSeconds": 10},
    }
    result = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/result",
        headers=connector_headers,
        json=result_payload,
    )
    duplicate_result = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/result",
        headers=connector_headers,
        json=result_payload,
    )
    assert result.status_code == duplicate_result.status_code == 200
    assert result.json()["status"] == "succeeded"

    with session_factory() as session:
        command = session.get(OpenBmcCommand, claim["commandId"])
        audits = session.exec(
            select(AuditEvent).where(AuditEvent.target_id == claim["commandId"])
        ).all()
    assert command is not None and command.active_slot is None
    assert {event.action for event in audits}.issuperset(
        {
            "openbmc.command.proposed",
            "openbmc.command.confirmed",
            "openbmc.command.claimed",
            "openbmc.command.progressed",
            "openbmc.command.succeeded",
        }
    )


def test_invalid_or_unbounded_commands_never_enter_the_queue(client, app, session_factory) -> None:
    _enable_openbmc(app)
    org_id, site_id, _ = _seed_admin(session_factory, email="invalid@openbmc.test")
    headers, _ = login_web(client, email="invalid@openbmc.test", password=PASSWORD)
    _, device, connector_headers = _provision(
        client,
        headers,
        organization_id=org_id,
        site_id=site_id,
        suffix="invalid",
    )
    _ingest_fresh(client, connector_headers, device["deviceId"])
    endpoint = f"/v1/openbmc/devices/{device['deviceId']}/command-proposals"
    shell = client.post(
        endpoint,
        headers=headers,
        json={
            "command": {"type": "shell", "arguments": {"command": "reboot"}},
            "reason": "This must be rejected",
        },
    )
    unbounded = client.post(
        endpoint,
        headers=headers,
        json={
            "command": {"type": "fan_boost", "arguments": {"seconds": 61}},
            "reason": "This must be rejected",
        },
    )
    unsafe_reset = client.post(
        endpoint,
        headers=headers,
        json={
            "command": {"type": "reset_dry_run", "arguments": {"dryRun": False}},
            "reason": "This must be rejected",
        },
    )
    assert shell.status_code == 422
    assert unbounded.status_code == 422
    assert unsafe_reset.status_code == 422

    unsupported_fan_payload = _observation_payload(
        device["deviceId"],
        source_id="collector-no-manual-boost:2",
    )
    unsupported_fan_payload["fan"]["manualBoostSupported"] = False
    observation = client.post(
        "/v1/openbmc-connector/observations",
        headers=connector_headers,
        json=unsupported_fan_payload,
    )
    assert observation.status_code == 200
    no_evidence = client.post(
        endpoint,
        headers=headers,
        json={
            "command": {"type": "fan_boost", "arguments": {"seconds": 10}},
            "reason": "This lacks live capability evidence",
        },
    )
    assert no_evidence.status_code == 409
    assert no_evidence.json()["detail"] == "openbmc_manual_boost_evidence_missing"
    with session_factory() as session:
        assert session.exec(select(OpenBmcCommand)).all() == []


def test_success_requires_delivery_and_exact_local_command_id(client, app, session_factory) -> None:
    _enable_openbmc(app)
    org_id, site_id, _ = _seed_admin(session_factory, email="delivery@openbmc.test")
    headers, _ = login_web(client, email="delivery@openbmc.test", password=PASSWORD)
    _, device, connector_headers = _provision(
        client,
        headers,
        organization_id=org_id,
        site_id=site_id,
        suffix="delivery",
    )
    _ingest_fresh(client, connector_headers, device["deviceId"])

    def propose_and_claim(key: str) -> dict:
        proposed = client.post(
            f"/v1/openbmc/devices/{device['deviceId']}/command-proposals",
            headers=headers,
            json={
                "command": {"type": "fan_boost", "arguments": {"seconds": 5}},
                "reason": "Validate terminal delivery guards",
                "idempotencyKey": key,
            },
        )
        assert proposed.status_code == 200, proposed.text
        confirmed = client.post(
            f"/v1/openbmc/commands/{proposed.json()['commandId']}/confirm",
            headers=headers,
            json={"expectedProposalHash": proposed.json()["proposalHash"]},
        )
        assert confirmed.status_code == 200, confirmed.text
        claimed = client.post("/v1/openbmc-connector/commands:claim", headers=connector_headers)
        assert claimed.status_code == 200 and claimed.json()["command"] is not None
        return claimed.json()["command"]

    claim = propose_and_claim("delivery-claimed-1")
    premature = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/result",
        headers=connector_headers,
        json={
            "leaseId": claim["leaseId"],
            "status": "succeeded",
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "localCommandId": "local-claimed",
            "failureCode": None,
            "result": {"effect": "fan_boost_completed"},
        },
    )
    assert premature.status_code == 409
    assert premature.json()["detail"] == "openbmc_success_requires_agent_delivery"
    failed = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/result",
        headers=connector_headers,
        json={
            "leaseId": claim["leaseId"],
            "status": "failed",
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "localCommandId": None,
            "failureCode": "collector_dispatch_failed",
            "result": {},
        },
    )
    assert failed.status_code == 200

    claim = propose_and_claim("delivery-accepted-2")
    accepted = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/progress",
        headers=connector_headers,
        json={
            "leaseId": claim["leaseId"],
            "status": "accepted_by_collector",
            "localCommandId": "local-accepted",
        },
    )
    assert accepted.status_code == 200
    premature = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/result",
        headers=connector_headers,
        json={
            "leaseId": claim["leaseId"],
            "status": "succeeded",
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "localCommandId": "local-accepted",
            "failureCode": None,
            "result": {"effect": "fan_boost_completed"},
        },
    )
    assert premature.status_code == 409
    assert premature.json()["detail"] == "openbmc_success_requires_agent_delivery"
    failed = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/result",
        headers=connector_headers,
        json={
            "leaseId": claim["leaseId"],
            "status": "failed",
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "localCommandId": "local-accepted",
            "failureCode": "agent_delivery_failed",
            "result": {},
        },
    )
    assert failed.status_code == 200

    claim = propose_and_claim("delivery-exact-3")
    for progress_status in ("accepted_by_collector", "delivered_to_agent"):
        progress = client.post(
            f"/v1/openbmc-connector/commands/{claim['commandId']}/progress",
            headers=connector_headers,
            json={
                "leaseId": claim["leaseId"],
                "status": progress_status,
                "localCommandId": "local-exact",
            },
        )
        assert progress.status_code == 200
    wrong_id = client.post(
        f"/v1/openbmc-connector/commands/{claim['commandId']}/result",
        headers=connector_headers,
        json={
            "leaseId": claim["leaseId"],
            "status": "succeeded",
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "localCommandId": "local-other",
            "failureCode": None,
            "result": {"effect": "fan_boost_completed"},
        },
    )
    assert wrong_id.status_code == 409
    assert wrong_id.json()["detail"] == "openbmc_success_requires_exact_local_command_id"


def test_claim_rejects_command_when_confirmer_loses_write_authority(client, app, session_factory) -> None:
    _enable_openbmc(app)
    org_id, site_id, user_id = _seed_admin(session_factory, email="revoked@openbmc.test")
    headers, _ = login_web(client, email="revoked@openbmc.test", password=PASSWORD)
    _, device, connector_headers = _provision(
        client,
        headers,
        organization_id=org_id,
        site_id=site_id,
        suffix="revoked",
    )
    _ingest_fresh(client, connector_headers, device["deviceId"])
    proposed = client.post(
        f"/v1/openbmc/devices/{device['deviceId']}/command-proposals",
        headers=headers,
        json={
            "command": {"type": "reset_dry_run", "arguments": {}},
            "reason": "Validate revoked confirmer guard",
            "idempotencyKey": "revoked-confirm-1",
        },
    )
    assert proposed.status_code == 200
    confirmed = client.post(
        f"/v1/openbmc/commands/{proposed.json()['commandId']}/confirm",
        headers=headers,
        json={"expectedProposalHash": proposed.json()["proposalHash"]},
    )
    assert confirmed.status_code == 200

    with session_factory() as session:
        membership = session.exec(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.organization_id == org_id,
            )
        ).one()
        membership.is_active = False
        session.add(membership)
        session.commit()

    claimed = client.post("/v1/openbmc-connector/commands:claim", headers=connector_headers)
    assert claimed.status_code == 200
    assert claimed.json()["command"] is None
    with session_factory() as session:
        command = session.get(OpenBmcCommand, proposed.json()["commandId"])
        audits = session.exec(select(AuditEvent).where(AuditEvent.target_id == command.id)).all()
    assert command is not None
    assert command.status == "rejected"
    assert command.failure_code == "confirmation_authority_revoked"
    assert any(event.action == "openbmc.command.rejected" for event in audits)


def test_read_path_expires_timed_out_active_command_and_releases_slot(
    client,
    app,
    session_factory,
) -> None:
    _enable_openbmc(app)
    org_id, site_id, _ = _seed_admin(session_factory, email="expiry@openbmc.test")
    headers, _ = login_web(client, email="expiry@openbmc.test", password=PASSWORD)
    _, device, connector_headers = _provision(
        client,
        headers,
        organization_id=org_id,
        site_id=site_id,
        suffix="expiry",
    )
    _ingest_fresh(client, connector_headers, device["deviceId"])

    def propose(key: str):
        response = client.post(
            f"/v1/openbmc/devices/{device['deviceId']}/command-proposals",
            headers=headers,
            json={
                "command": {"type": "reset_dry_run", "arguments": {}},
                "reason": "Validate server deadline cleanup",
                "idempotencyKey": key,
            },
        )
        assert response.status_code == 200, response.text
        return response.json()

    first = propose("expiry-command-1")
    confirmed = client.post(
        f"/v1/openbmc/commands/{first['commandId']}/confirm",
        headers=headers,
        json={"expectedProposalHash": first["proposalHash"]},
    )
    assert confirmed.status_code == 200
    with session_factory() as session:
        command = session.get(OpenBmcCommand, first["commandId"])
        command.execution_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        session.add(command)
        session.commit()

    detail = client.get(f"/v1/openbmc/devices/{device['deviceId']}", headers=headers)
    assert detail.status_code == 200
    expired_command = next(
        command
        for command in detail.json()["recentCommands"]
        if command["commandId"] == first["commandId"]
    )
    assert expired_command["status"] == "expired"
    with session_factory() as session:
        command = session.get(OpenBmcCommand, first["commandId"])
        audits = session.exec(select(AuditEvent).where(AuditEvent.target_id == command.id)).all()
    assert command.active_slot is None
    assert command.failure_code == "queue_expired"
    assert any(
        event.action == "openbmc.command.expired"
        and event.metadata_json.get("expiredBy") == "server_deadline_guard"
        for event in audits
    )

    second = propose("expiry-command-2")
    confirmed = client.post(
        f"/v1/openbmc/commands/{second['commandId']}/confirm",
        headers=headers,
        json={"expectedProposalHash": second["proposalHash"]},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "queued"


def test_openbmc_web_timestamps_keep_utc_offset_after_sqlite_round_trip(
    client,
    app,
    session_factory,
) -> None:
    _enable_openbmc(app)
    org_id, site_id, _ = _seed_admin(session_factory, email="timezone@openbmc.test")
    headers, _ = login_web(client, email="timezone@openbmc.test", password=PASSWORD)
    connector, device, connector_headers = _provision(
        client,
        headers,
        organization_id=org_id,
        site_id=site_id,
        suffix="timezone",
    )
    _ingest_fresh(client, connector_headers, device["deviceId"])
    event = client.post(
        "/v1/openbmc-connector/events:batch",
        headers=connector_headers,
        json={
            "schemaVersion": "openbmc-events.v1",
            "deviceId": device["deviceId"],
            "events": [
                {
                    "sourceEventKey": "timezone:event:1",
                    "occurredAt": datetime.now(timezone.utc).isoformat(),
                    "severity": "info",
                    "source": "pi5-agent",
                    "code": "timezone_probe",
                    "message": "Timezone serialization probe.",
                    "details": {},
                }
            ],
        },
    )
    assert event.status_code == 200
    proposal = client.post(
        f"/v1/openbmc/devices/{device['deviceId']}/command-proposals",
        headers=headers,
        json={
            "command": {"type": "reset_dry_run", "arguments": {}},
            "reason": "Timezone serialization regression",
            "idempotencyKey": "timezone-command-1",
        },
    )
    assert proposal.status_code == 200

    # These requests use new DB sessions, reproducing SQLite's loss of tzinfo
    # before the API serialization boundary restores UTC.
    connector_list = client.get(
        "/v1/openbmc/connectors",
        headers=headers,
        params={"organizationId": org_id},
    )
    assert connector_list.status_code == 200
    connector_json = next(
        item
        for item in connector_list.json()["connectors"]
        if item["connectorId"] == connector["connectorId"]
    )
    for field in ("createdAt", "updatedAt", "lastHeartbeatAt", "lastObservationAt"):
        _assert_timestamp_has_offset(connector_json[field])

    detail = client.get(f"/v1/openbmc/devices/{device['deviceId']}", headers=headers)
    assert detail.status_code == 200
    body = detail.json()
    for field in ("lastObservedAt", "lastIngestedAt"):
        _assert_timestamp_has_offset(body[field])
    for field in ("observedAt", "collectorReceivedAt", "ingestedAt"):
        _assert_timestamp_has_offset(body["latestObservation"][field])
    _assert_timestamp_has_offset(body["recentEvents"][0]["occurredAt"])
    command = next(
        item
        for item in body["recentCommands"]
        if item["commandId"] == proposal.json()["commandId"]
    )
    for field in ("proposedAt", "confirmationExpiresAt"):
        _assert_timestamp_has_offset(command[field])
