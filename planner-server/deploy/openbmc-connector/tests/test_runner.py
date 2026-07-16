from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fourwall_openbmc_connector.config import (
    CloudConfig,
    CollectorConfig,
    ConnectorConfig,
)
from fourwall_openbmc_connector.runner import ConnectorRunner
from fourwall_openbmc_connector.state import StateStore


def collector_state():
    return {
        "reading": {
            "timestamp": "2026-07-17T03:20:10+00:00",
            "received_at": "2026-07-17T03:20:11+00:00",
            "temperature_c": 56.2,
            "status": "Normal",
            "health": "OK",
            "stale": False,
        },
        "fan": {
            "present": True,
            "rpm": 1250,
            "pwm": 75,
            "cooling_state": 1,
            "cooling_max_state": 4,
            "manual_boost_supported": True,
        },
        "thresholds": {"warning_c": 65, "critical_c": 75},
        "events": [],
        "commands": [],
    }


class MutableClock:
    def __init__(self):
        self.value = datetime(2026, 7, 17, 3, 20, 12, tzinfo=timezone.utc)

    def __call__(self):
        return self.value


class FakeCloud:
    def __init__(self, clock, claim):
        self.clock = clock
        self.claim = claim
        self.observations = []
        self.event_batches = []
        self.progress = []
        self.results = []
        self.heartbeats = []
        self.operations = []

    def get_config(self):
        return {
            "schemaVersion": "openbmc-connector-config.v1",
            "pollIntervalSeconds": 5,
            "commandClaimIntervalSeconds": 1,
            "devices": [
                {
                    "deviceId": "device_1",
                    "status": "active",
                    "capabilities": ["fan_boost", "reset_dry_run"],
                }
            ],
        }

    def post_heartbeat(self, **kwargs):
        self.operations.append("heartbeat")
        self.heartbeats.append(kwargs)
        return {}

    def post_observation(self, payload):
        self.observations.append(payload)
        return {}

    def post_event_batch(self, payload):
        self.event_batches.append(payload)
        return {}

    def claim_command(self):
        self.operations.append("claim")
        claim, self.claim = self.claim, None
        return claim

    def post_progress(self, **kwargs):
        self.progress.append(kwargs)
        return {}

    def post_result(self, *, command_id, payload):
        self.results.append((command_id, payload))
        return {}


class FakeCollector:
    def __init__(self):
        self.state = collector_state()
        self.executions = []

    def get_state(self):
        return self.state

    def execute(self, command_type, arguments):
        self.executions.append((command_type, arguments))
        return "42"


def make_runner(tmp_path, claim):
    clock = MutableClock()
    config = ConnectorConfig(
        cloud=CloudConfig("https://api.example.com", "fwobmc_secret"),
        collector=CollectorConfig("http://127.0.0.1:8080"),
        state_path=tmp_path / "state.json",
    )
    cloud = FakeCloud(clock, claim)
    collector = FakeCollector()
    runner = ConnectorRunner(
        config=config,
        cloud=cloud,
        collector=collector,
        state=StateStore(config.state_path),
        now=clock,
        sleep=lambda _: None,
    )
    return runner, cloud, collector, clock


def fan_claim(clock):
    return {
        "commandId": "cmd_1",
        "leaseId": "lease_1",
        "leaseExpiresAt": (clock.value + timedelta(seconds=20)).isoformat(),
        "deviceId": "device_1",
        "command": {"type": "fan_boost", "arguments": {"seconds": 10}},
        "idempotencyKey": "cmd_1",
    }


def test_runner_reports_accept_delivery_and_explicit_execution(tmp_path):
    placeholder_clock = MutableClock()
    runner, cloud, collector, clock = make_runner(
        tmp_path, fan_claim(placeholder_clock)
    )

    runner.run_once()
    assert collector.executions == [("fan_boost", {"seconds": 10})]
    assert cloud.progress[-1]["status"] == "accepted_by_collector"
    assert cloud.results == []

    collector.state["commands"] = [{"id": 42, "status": "delivered"}]
    runner.run_once()
    assert cloud.progress[-1]["status"] == "delivered_to_agent"
    assert cloud.results == []

    collector.state["events"] = [
        {
            "id": 88,
            "timestamp": "2026-07-17T03:20:15+00:00",
            "severity": "Info",
            "source": "QEMU OpenBMC Agent",
            "message": (
                "QEMU OpenBMC agent executed fan boost command id=42 seconds=10."
            ),
        }
    ]
    runner.run_once()

    assert cloud.results[-1][1]["status"] == "succeeded"
    assert cloud.results[-1][1]["result"]["collectorEventId"] == "88"
    assert runner.state.active_command is None


def test_due_heartbeat_is_sent_before_command_claim(tmp_path):
    placeholder_clock = MutableClock()
    runner, cloud, _, _ = make_runner(tmp_path, fan_claim(placeholder_clock))

    runner.run_once()

    assert cloud.operations[:2] == ["heartbeat", "claim"]


def test_delivery_without_execution_event_never_becomes_success(tmp_path):
    placeholder_clock = MutableClock()
    runner, cloud, collector, clock = make_runner(
        tmp_path, fan_claim(placeholder_clock)
    )
    runner.run_once()
    collector.state["commands"] = [{"id": 42, "status": "delivered"}]
    clock.value += timedelta(seconds=21)

    runner.run_once()

    assert cloud.results[-1][1]["status"] == "failed"
    assert cloud.results[-1][1]["failureCode"] == "execution_unverified"
    assert all(payload["status"] != "succeeded" for _, payload in cloud.results)


def test_execution_event_without_command_row_posts_delivery_before_success(tmp_path):
    placeholder_clock = MutableClock()
    runner, cloud, collector, _ = make_runner(
        tmp_path, fan_claim(placeholder_clock)
    )
    runner.run_once()
    collector.state["events"] = [
        {
            "id": 89,
            "timestamp": "2026-07-17T03:20:15+00:00",
            "severity": "Info",
            "source": "QEMU OpenBMC Agent",
            "message": (
                "QEMU OpenBMC agent executed fan boost command id=42 seconds=10."
            ),
        }
    ]

    runner.run_once()

    assert [item["status"] for item in cloud.progress] == [
        "accepted_by_collector",
        "delivered_to_agent",
    ]
    assert cloud.results[-1][1]["status"] == "succeeded"
    assert runner.state.active_command is None


def test_delivery_and_execution_evidence_in_same_poll_progress_before_success(tmp_path):
    placeholder_clock = MutableClock()
    runner, cloud, collector, _ = make_runner(
        tmp_path, fan_claim(placeholder_clock)
    )
    runner.run_once()
    collector.state["commands"] = [{"id": 42, "status": "delivered"}]
    collector.state["events"] = [
        {
            "id": 90,
            "timestamp": "2026-07-17T03:20:15+00:00",
            "severity": "Info",
            "source": "QEMU OpenBMC Agent",
            "message": (
                "QEMU OpenBMC agent executed fan boost command id=42 seconds=10."
            ),
        }
    ]

    runner.run_once()

    assert cloud.progress[-1]["status"] == "delivered_to_agent"
    assert cloud.results[-1][1]["status"] == "succeeded"
    assert cloud.results[-1][1]["localCommandId"] == "42"


def test_dispatching_recovery_does_not_repeat_local_side_effect(tmp_path):
    runner, cloud, collector, clock = make_runner(tmp_path, None)
    runner._refresh_config(force=True)
    runner.state.set_active_command(
        {
            "commandId": "cmd_1",
            "leaseId": "lease_1",
            "leaseExpiresAt": (clock.value + timedelta(seconds=10)).isoformat(),
            "deviceId": "device_1",
            "commandType": "fan_boost",
            "arguments": {"seconds": 10},
            "phase": "dispatching",
            "localCommandId": None,
            "dispatchedAt": clock.value.isoformat(),
        }
    )

    runner.run_once()

    assert collector.executions == []
    assert cloud.results[-1][1]["failureCode"] == (
        "local_delivery_unknown_after_restart"
    )


def test_unknown_command_is_failed_without_local_dispatch(tmp_path):
    clock = MutableClock()
    claim = {
        "commandId": "cmd_1",
        "leaseId": "lease_1",
        "leaseExpiresAt": (clock.value + timedelta(seconds=20)).isoformat(),
        "deviceId": "device_1",
        "command": {"type": "shell", "arguments": {"command": "whoami"}},
    }
    runner, cloud, collector, _ = make_runner(tmp_path, claim)

    runner.run_once()

    assert collector.executions == []
    assert cloud.results[-1][1]["status"] == "failed"
    assert cloud.results[-1][1]["failureCode"] == "unsupported_command"
