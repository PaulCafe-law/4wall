from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import httpx


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import Settings
from app.line_floorplan.tokens import create_floorplan_render_token


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke test the deployed LINE floorplan PNG endpoint.")
    parser.add_argument("--base-url", required=True, help="Public API origin, e.g. https://staging-api.example.com")
    parser.add_argument("--group-id", required=True, help="Bound LINE group id used for the render token.")
    parser.add_argument("--site-slug", default="jingcheng")
    parser.add_argument("--width", type=int, default=1040)
    return parser.parse_args()


def main() -> int:
    _configure_stdio()
    args = parse_args()
    settings = Settings.from_env()
    token = create_floorplan_render_token(settings, site_slug=args.site_slug, group_id=args.group_id)
    url = f"{args.base_url.rstrip('/')}/v1/line/floorplan/{args.site_slug}/{token}/{args.width}"
    first = _fetch_png(url)
    second = _fetch_png(url)
    cache = second.headers.get("x-line-floorplan-cache")
    if cache != "hit":
        raise SystemExit(f"floorplan_cache_miss: expected hit, got {cache!r}")
    print(
        json.dumps(
            {
                "ok": True,
                "url": _redact_token_url(url),
                "statusCode": first.status_code,
                "contentType": first.headers.get("content-type"),
                "cache": cache,
                "bytes": len(first.content),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def _fetch_png(url: str) -> httpx.Response:
    response = httpx.get(url, timeout=20)
    if response.status_code == 403:
        raise SystemExit("floorplan_forbidden: check group binding, site id, and BUILDING_ROUTE_AUTH_SECRET_KEY")
    if response.status_code != 200:
        raise SystemExit(f"floorplan_unexpected_status: {response.status_code} {response.text[:200]}")
    content_type = response.headers.get("content-type", "")
    if "image/png" not in content_type.lower():
        raise SystemExit(f"floorplan_unexpected_content_type: {content_type}")
    if not response.content.startswith(PNG_MAGIC):
        raise SystemExit("floorplan_not_png")
    return response


def _redact_token_url(url: str) -> str:
    parts = url.split("/")
    if len(parts) >= 3:
        parts[-2] = "<token>"
    return "/".join(parts)


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
