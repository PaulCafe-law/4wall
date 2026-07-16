from __future__ import annotations

import json
import ssl
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import (
    HTTPRedirectHandler,
    HTTPSHandler,
    Request,
    build_opener,
)


MAX_RESPONSE_BYTES = 2 * 1024 * 1024


class TransportError(RuntimeError):
    def __init__(self, code: str, *, status: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class JsonResponse:
    status: int
    data: Any


class JsonTransport(Protocol):
    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: dict[str, Any] | None,
        timeout: float,
    ) -> JsonResponse: ...


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


class UrllibJsonTransport:
    """Small JSON transport with certificate verification and redirects disabled."""

    def __init__(self) -> None:
        tls_context = ssl.create_default_context()
        self._opener = build_opener(_NoRedirectHandler(), HTTPSHandler(context=tls_context))

    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: dict[str, Any] | None,
        timeout: float,
    ) -> JsonResponse:
        encoded: bytes | None = None
        if body is not None:
            encoded = json.dumps(
                body, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            ).encode("utf-8")
        request = Request(url, data=encoded, headers=headers, method=method)
        try:
            with self._opener.open(request, timeout=timeout) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                status = int(response.status)
        except HTTPError as exc:
            raise TransportError("http_error", status=int(exc.code)) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise TransportError("network_error") from exc
        if len(raw) > MAX_RESPONSE_BYTES:
            raise TransportError("response_too_large", status=status)
        if not raw:
            return JsonResponse(status=status, data={})
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise TransportError("invalid_json_response", status=status) from exc
        return JsonResponse(status=status, data=data)
