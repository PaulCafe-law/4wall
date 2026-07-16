from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from .config import CloudConfig, CollectorConfig
from .http import JsonResponse, JsonTransport, TransportError


_SAFE_PATH_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class ClientError(RuntimeError):
    def __init__(self, code: str, *, status: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


def _expect_success(response: JsonResponse) -> Any:
    if not 200 <= response.status < 300:
        raise ClientError("unexpected_http_status", status=response.status)
    return response.data


def _require_object(value: Any, code: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ClientError(code)
    return value


def _fixed_segment(value: str, field_name: str) -> str:
    if not _SAFE_PATH_ID.fullmatch(value):
        raise ClientError(f"invalid_{field_name}")
    return value


class CloudClient:
    def __init__(self, config: CloudConfig, transport: JsonTransport) -> None:
        if not config.token.startswith("fwobmc_"):
            raise ClientError("invalid_connector_token_prefix")
        self._config = config
        self._transport = transport

    def _request(
        self,
        *,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self._config.token}",
            "User-Agent": "fourwall-openbmc-connector/0.1.0",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key[:200]
        try:
            response = self._transport.request(
                method=method,
                url=f"{self._config.api_base_url}{path}",
                headers=headers,
                body=body,
                timeout=self._config.timeout_seconds,
            )
        except TransportError as exc:
            raise ClientError(exc.code, status=exc.status) from exc
        return _expect_success(response)

    def get_config(self) -> dict[str, Any]:
        return _require_object(
            self._request(method="GET", path="/v1/openbmc-connector/config"),
            "invalid_config_response",
        )

    def post_heartbeat(
        self, *, version: str, last_error_code: str | None
    ) -> dict[str, Any]:
        body = {"version": version, "lastErrorCode": last_error_code}
        return _require_object(
            self._request(
                method="POST",
                path="/v1/openbmc-connector/heartbeat",
                body=body,
            ),
            "invalid_heartbeat_response",
        )

    def post_observation(self, payload: dict[str, Any]) -> dict[str, Any]:
        source_id = str(payload.get("sourceObservationId", ""))
        return _require_object(
            self._request(
                method="POST",
                path="/v1/openbmc-connector/observations",
                body=payload,
                idempotency_key=source_id,
            ),
            "invalid_observation_response",
        )

    def post_event_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        keys = [
            str(event.get("sourceEventKey", ""))
            for event in payload.get("events", [])
            if isinstance(event, dict)
        ]
        digest = hashlib.sha256(
            json.dumps(keys, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        return _require_object(
            self._request(
                method="POST",
                path="/v1/openbmc-connector/events:batch",
                body=payload,
                idempotency_key=f"events-{digest}",
            ),
            "invalid_event_batch_response",
        )

    def claim_command(self) -> dict[str, Any] | None:
        response = _require_object(
            self._request(
                method="POST",
                path="/v1/openbmc-connector/commands:claim",
                body=None,
            ),
            "invalid_claim_response",
        )
        command = response.get("command")
        if command is None:
            return None
        return _require_object(command, "invalid_claim_command")

    def post_progress(
        self,
        *,
        command_id: str,
        lease_id: str,
        status: str,
        local_command_id: str | None,
    ) -> dict[str, Any]:
        command_segment = _fixed_segment(command_id, "command_id")
        body = {
            "leaseId": lease_id,
            "status": status,
            "localCommandId": local_command_id,
        }
        return _require_object(
            self._request(
                method="POST",
                path=f"/v1/openbmc-connector/commands/{command_segment}/progress",
                body=body,
                idempotency_key=f"{command_id}-progress-{status}",
            ),
            "invalid_progress_response",
        )

    def post_result(
        self,
        *,
        command_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        command_segment = _fixed_segment(command_id, "command_id")
        status = str(payload.get("status", "unknown"))
        return _require_object(
            self._request(
                method="POST",
                path=f"/v1/openbmc-connector/commands/{command_segment}/result",
                body=payload,
                idempotency_key=f"{command_id}-result-{status}",
            ),
            "invalid_result_response",
        )


class CollectorClient:
    def __init__(self, config: CollectorConfig, transport: JsonTransport) -> None:
        self._config = config
        self._transport = transport

    def _request(self, *, method: str, path: str) -> dict[str, Any]:
        try:
            response = self._transport.request(
                method=method,
                url=f"{self._config.base_url}{path}",
                headers={"Accept": "application/json"},
                body=None,
                timeout=self._config.timeout_seconds,
            )
        except TransportError as exc:
            raise ClientError(exc.code, status=exc.status) from exc
        return _require_object(_expect_success(response), "invalid_collector_response")

    def get_state(self) -> dict[str, Any]:
        return self._request(method="GET", path="/api/state")

    def execute(self, command_type: str, arguments: dict[str, Any]) -> str:
        if command_type == "fan_boost":
            seconds = arguments.get("seconds")
            if (
                isinstance(seconds, bool)
                or not isinstance(seconds, int)
                or not 1 <= seconds <= 60
                or set(arguments) != {"seconds"}
            ):
                raise ClientError("invalid_fan_boost_arguments")
            response = self._request(
                method="POST", path=f"/api/fan/boost?seconds={seconds}"
            )
        elif command_type == "reset_dry_run":
            if arguments:
                raise ClientError("invalid_reset_dry_run_arguments")
            response = self._request(method="POST", path="/api/reset?dry_run=true")
        else:
            raise ClientError("unsupported_command")
        if response.get("ok") is not True:
            raise ClientError("collector_rejected_command")
        command = _require_object(response.get("command"), "missing_local_command")
        local_id = command.get("id")
        if isinstance(local_id, bool) or not isinstance(local_id, (int, str)):
            raise ClientError("invalid_local_command_id")
        local_id_text = str(local_id)
        if not re.fullmatch(r"[0-9]{1,20}", local_id_text):
            raise ClientError("invalid_local_command_id")
        return local_id_text
