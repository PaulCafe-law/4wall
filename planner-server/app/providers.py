from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx

from app.dto import GeoPointDto, MissionPlanRequestDto


@dataclass(frozen=True)
class RoutePath:
    points: list[GeoPointDto]


class SupportsGet(Protocol):
    def get(self, url: str, params: dict[str, str]) -> object: ...


class RouteProviderError(RuntimeError):
    pass


class RouteProvider:
    def plan_route(self, request: MissionPlanRequestDto) -> RoutePath:
        raise NotImplementedError


class MockRouteProvider(RouteProvider):
    def plan_route(self, request: MissionPlanRequestDto) -> RoutePath:
        origin = request.origin
        target = GeoPointDto(
            lat=request.inspectionIntent.viewpoints[0].lat,
            lng=request.inspectionIntent.viewpoints[0].lng,
        )
        midpoint = GeoPointDto(
            lat=(origin.lat + target.lat) / 2,
            lng=(origin.lng + target.lng) / 2,
        )
        branch_hint = GeoPointDto(
            lat=midpoint.lat + 0.00015,
            lng=midpoint.lng + 0.00012,
        )
        return RoutePath(points=[origin, midpoint, branch_hint, target])


class OsmOsrmRouteProvider(RouteProvider):
    def __init__(
        self,
        base_url: str = "https://router.project-osrm.org",
        profile: str = "driving",
        client: SupportsGet | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.profile = profile
        self.client = client or httpx.Client(timeout=10.0)

    def plan_route(self, request: MissionPlanRequestDto) -> RoutePath:
        origin = request.origin
        target = request.inspectionIntent.viewpoints[0]
        coordinates = f"{origin.lng},{origin.lat};{target.lng},{target.lat}"
        response = self.client.get(
            f"{self.base_url}/route/v1/{self.profile}/{coordinates}",
            params={
                "overview": "full",
                "geometries": "geojson",
                "steps": "true",
            },
        )
        response.raise_for_status()
        payload = response.json()

        routes = payload.get("routes") or []
        if not routes:
            raise RouteProviderError("OSRM returned no routes")

        geometry = routes[0].get("geometry", {})
        coordinates_list = geometry.get("coordinates") or []
        if not coordinates_list:
            raise RouteProviderError("OSRM returned empty geometry")

        points = [GeoPointDto(lat=lat, lng=lng) for lng, lat in coordinates_list]
        return RoutePath(points=points)
