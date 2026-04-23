from __future__ import annotations

from typing import Any

DEFAULT_OPERATING_PROFILE = "outdoor_gps_patrol"
DEFAULT_IMPLICIT_RETURN_TO_LAUNCH = True


def mission_bundle_payload(response_json: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(response_json, dict):
        return {}
    mission_bundle = response_json.get("missionBundle")
    if isinstance(mission_bundle, dict):
        return mission_bundle
    return {}


def derive_operating_profile(
    request_json: dict[str, Any] | None,
    response_json: dict[str, Any] | None,
) -> str:
    if isinstance(request_json, dict):
        value = request_json.get("operatingProfile")
        if isinstance(value, str) and value:
            return value
    mission_bundle = mission_bundle_payload(response_json)
    value = mission_bundle.get("operatingProfile")
    if isinstance(value, str) and value:
        return value
    return DEFAULT_OPERATING_PROFILE


def derive_launch_point(
    request_json: dict[str, Any] | None,
    response_json: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if isinstance(request_json, dict):
        value = request_json.get("launchPoint")
        if isinstance(value, dict):
            return value
        origin = request_json.get("origin")
        if isinstance(origin, dict):
            return {"location": origin, "label": "legacy_origin"}
    mission_bundle = mission_bundle_payload(response_json)
    value = mission_bundle.get("launchPoint")
    if isinstance(value, dict):
        return value
    return None


def derive_waypoint_count(
    request_json: dict[str, Any] | None,
    response_json: dict[str, Any] | None,
) -> int:
    if isinstance(request_json, dict):
        ordered_waypoints = request_json.get("orderedWaypoints")
        if isinstance(ordered_waypoints, list):
            return len(ordered_waypoints)
        inspection_intent = request_json.get("inspectionIntent")
        if isinstance(inspection_intent, dict):
            legacy_viewpoints = inspection_intent.get("viewpoints")
            if isinstance(legacy_viewpoints, list):
                return len(legacy_viewpoints)
    mission_bundle = mission_bundle_payload(response_json)
    ordered_waypoints = mission_bundle.get("orderedWaypoints")
    if isinstance(ordered_waypoints, list):
        return len(ordered_waypoints)
    return 0


def derive_implicit_return_to_launch(
    request_json: dict[str, Any] | None,
    response_json: dict[str, Any] | None,
) -> bool:
    if isinstance(request_json, dict):
        value = request_json.get("implicitReturnToLaunch")
        if isinstance(value, bool):
            return value
    mission_bundle = mission_bundle_payload(response_json)
    value = mission_bundle.get("implicitReturnToLaunch")
    if isinstance(value, bool):
        return value
    return DEFAULT_IMPLICIT_RETURN_TO_LAUNCH
