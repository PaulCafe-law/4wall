from __future__ import annotations

from urllib.parse import urlencode

from sqlmodel import Session, select

from app.models import LineGroupBinding

from .tokens import create_floorplan_liveview_token


def build_liveview_url(settings, *, site_slug: str, token: str, focus: str | None = None) -> str | None:
    if not settings.app_origin:
        return None
    query = {"token": token}
    if focus:
        query["focus"] = focus
    return f"{settings.app_origin.rstrip('/')}/m/floorplan/{site_slug}?{urlencode(query)}"


def liveview_url_for_binding(
    settings,
    *,
    site_slug: str,
    group_id: str | None = None,
    source_type: str = "group",
    source_id: str | None = None,
    destination_id: str | None = None,
    focus: str | None = None,
) -> str | None:
    token = create_floorplan_liveview_token(
        settings,
        site_slug=site_slug,
        group_id=group_id,
        source_type=source_type,
        source_id=source_id,
        destination_id=destination_id,
    )
    return build_liveview_url(settings, site_slug=site_slug, token=token, focus=focus)


def liveview_url_for_incident(session: Session, settings, incident) -> str | None:
    if not settings.app_origin or not settings.line_default_group_id or not incident.site_id:
        return None
    binding = session.exec(
        select(LineGroupBinding).where(
            LineGroupBinding.group_id == settings.line_default_group_id,
            LineGroupBinding.source_type == "group",
            LineGroupBinding.site_id == incident.site_id,
            LineGroupBinding.is_active == True,  # noqa: E712
        )
    ).first()
    if binding is None:
        return None
    return liveview_url_for_binding(
        settings,
        site_slug=binding.site_slug,
        group_id=binding.group_id,
        focus=f"incident:{incident.id}",
    )
