from __future__ import annotations

from fourwall_openbmc_connector.normalize import (
    normalize_events,
    normalize_observation,
    reconcile_execution_event,
)


def state_fixture():
    return {
        "reading": {
            "timestamp": "2026-07-17T03:20:10+00:00",
            "received_at": "2026-07-17T03:20:11+00:00",
            "temperature_c": 0,
            "status": "Normal",
            "health": "OK",
            "stale": False,
        },
        "fan": {
            "present": False,
            "rpm": 0,
            "pwm": 0,
            "cooling_state": 0,
            "cooling_max_state": 4,
            "manual_boost_supported": False,
        },
        "thresholds": {"warning_c": 65, "critical_c": 75},
        "events": [],
        "commands": [],
    }


def test_observation_preserves_zero_and_fan_absent():
    payload = normalize_observation(
        state_fixture(), device_id="device-1", collector_instance_id="instance-1"
    )

    assert payload is not None
    assert payload["temperatureC"] == 0
    assert payload["fan"]["present"] is False
    assert payload["fan"]["rpm"] == 0
    assert payload["fan"]["pwm"] == 0
    assert payload["collectorStale"] is False


def test_observation_id_is_stable_for_duplicate_poll():
    first = normalize_observation(
        state_fixture(), device_id="device-1", collector_instance_id="instance-1"
    )
    second = normalize_observation(
        state_fixture(), device_id="device-1", collector_instance_id="instance-1"
    )

    assert first["sourceObservationId"] == second["sourceObservationId"]


def test_event_severity_is_restricted_and_text_is_bounded():
    state = state_fixture()
    state["events"] = [
        {
            "id": 7,
            "timestamp": "2026-07-17T03:20:12+00:00",
            "severity": "Normal",
            "source": "Q" * 120,
            "message": ("m" * 600) + "\x00",
            "details": "x" * 2000,
        }
    ]

    events = normalize_events(
        state, device_id="device-1", collector_instance_id="instance-1"
    )

    assert events[0]["severity"] == "info"
    assert len(events[0]["source"]) == 80
    assert len(events[0]["message"]) == 500
    assert len(events[0]["details"]["text"]) == 1000


def test_observation_values_outside_cloud_contract_are_omitted():
    state = state_fixture()
    state["reading"]["temperature_c"] = 151
    state["fan"]["rpm"] = 500_001
    state["thresholds"] = {"warning_c": 151, "critical_c": 200}

    payload = normalize_observation(
        state, device_id="device-1", collector_instance_id="instance-1"
    )

    assert payload is not None
    assert payload["temperatureC"] is None
    assert payload["fan"]["rpm"] is None
    assert payload["thresholds"] == {"warningC": None, "criticalC": None}


def test_reconciliation_accepts_both_historic_id_formats():
    for message in (
        "QEMU OpenBMC agent executed fan boost command id=42 seconds=10.",
        "QEMU OpenBMC agent executed fan boost command id 42 seconds=10.",
    ):
        state = state_fixture()
        state["events"] = [
            {
                "id": 9,
                "timestamp": "2026-07-17T03:20:12+00:00",
                "source": "QEMU OpenBMC Agent",
                "message": message,
            }
        ]
        assert reconcile_execution_event(
            state,
            command_type="fan_boost",
            local_command_id="42",
            not_before="2026-07-17T03:20:10+00:00",
        ) == ("succeeded", "9")


def test_reconciliation_requires_exact_numeric_id_and_new_event():
    state = state_fixture()
    state["events"] = [
        {
            "id": 1,
            "timestamp": "2026-07-17T03:19:00+00:00",
            "source": "QEMU OpenBMC Agent",
            "message": "QEMU OpenBMC agent executed fan boost command id=42 seconds=10.",
        },
        {
            "id": 2,
            "timestamp": "2026-07-17T03:20:12+00:00",
            "source": "QEMU OpenBMC Agent",
            "message": "QEMU OpenBMC agent executed fan boost command id=420 seconds=10.",
        },
    ]

    assert reconcile_execution_event(
        state,
        command_type="fan_boost",
        local_command_id="42",
        not_before="2026-07-17T03:20:10+00:00",
    ) == (None, None)
