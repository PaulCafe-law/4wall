from __future__ import annotations

import pytest

from fourwall_openbmc_connector.clients import (
    ClientError,
    CloudClient,
    CollectorClient,
)
from fourwall_openbmc_connector.config import CloudConfig, CollectorConfig
from fourwall_openbmc_connector.http import JsonResponse


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


def test_cloud_auth_and_claim_contract():
    transport = FakeTransport(
        [
            JsonResponse(
                200,
                {
                    "command": {
                        "commandId": "cmd_1",
                        "leaseId": "lease",
                        "leaseExpiresAt": "2026-07-17T03:20:30+00:00",
                        "deviceId": "device_1",
                        "command": {"type": "reset_dry_run", "arguments": {}},
                    }
                },
            )
        ]
    )
    client = CloudClient(
        CloudConfig("https://api.example.com", "fwobmc_secret"), transport
    )

    claim = client.claim_command()

    assert claim["commandId"] == "cmd_1"
    assert transport.calls[0]["url"].endswith(
        "/v1/openbmc-connector/commands:claim"
    )
    assert transport.calls[0]["headers"]["Authorization"] == "Bearer fwobmc_secret"
    assert transport.calls[0]["body"] is None


def test_collector_uses_only_fixed_fan_path():
    transport = FakeTransport(
        [JsonResponse(200, {"ok": True, "command": {"id": 42}})]
    )
    client = CollectorClient(
        CollectorConfig("http://127.0.0.1:8080"), transport
    )

    assert client.execute("fan_boost", {"seconds": 10}) == "42"
    assert transport.calls[0]["method"] == "POST"
    assert transport.calls[0]["url"] == (
        "http://127.0.0.1:8080/api/fan/boost?seconds=10"
    )


def test_reset_is_always_dry_run_and_unknown_command_never_dispatches():
    transport = FakeTransport(
        [JsonResponse(200, {"ok": True, "command": {"id": 7}})]
    )
    client = CollectorClient(
        CollectorConfig("http://127.0.0.1:8080"), transport
    )

    assert client.execute("reset_dry_run", {}) == "7"
    assert transport.calls[0]["url"].endswith("/api/reset?dry_run=true")
    with pytest.raises(ClientError, match="unsupported_command"):
        client.execute("reset", {})
    assert len(transport.calls) == 1


def test_invalid_fan_arguments_never_dispatch():
    transport = FakeTransport([])
    client = CollectorClient(
        CollectorConfig("http://127.0.0.1:8080"), transport
    )

    with pytest.raises(ClientError, match="invalid_fan_boost_arguments"):
        client.execute("fan_boost", {"seconds": 61})
    assert transport.calls == []
