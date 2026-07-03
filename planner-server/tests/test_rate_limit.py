from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace

from app.rate_limit import client_identity


def test_client_identity_uses_remote_addr_in_development(test_settings) -> None:
    request = SimpleNamespace(
        headers={"x-forwarded-for": "203.0.113.10, 10.0.0.2"},
        client=SimpleNamespace(host="127.0.0.1"),
    )
    settings = replace(test_settings, environment="development")

    assert client_identity(request, settings) == "127.0.0.1"


def test_client_identity_trusts_leftmost_forwarded_for_outside_development(test_settings) -> None:
    request = SimpleNamespace(
        headers={"x-forwarded-for": "203.0.113.10, 10.0.0.2"},
        client=SimpleNamespace(host="10.0.0.9"),
    )
    settings = replace(test_settings, environment="staging")

    assert client_identity(request, settings) == "203.0.113.10"


def test_client_identity_falls_back_to_remote_addr_without_forwarded_for(test_settings) -> None:
    request = SimpleNamespace(headers={}, client=SimpleNamespace(host="10.0.0.9"))
    settings = replace(test_settings, environment="production")

    assert client_identity(request, settings) == "10.0.0.9"
