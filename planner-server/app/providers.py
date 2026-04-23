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
        launch = request.launchPoint.location
        ordered = [waypoint.location for waypoint in sorted(request.orderedWaypoints, key=lambda item: item.sequence)]
        return RoutePath(points=[launch, *ordered, launch])


class OsmOsrmRouteProvider(RouteProvider):
    def __init__(
        self,
        *,
        base_url: str = "https://router.project-osrm.org",
        profile: str = "driving",
        client: SupportsGet | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.profile = profile
        self.client = client or httpx.Client(timeout=10.0)

    def plan_route(self, request: MissionPlanRequestDto) -> RoutePath:
        ordered = [waypoint.location for waypoint in sorted(request.orderedWaypoints, key=lambda item: item.sequence)]
        route_points = [request.launchPoint.location, *ordered, request.launchPoint.location]
        if request.operatingProfile == "indoor_no_gps":
            return RoutePath(points=route_points)

        stitched: list[GeoPointDto] = []
        for start, end in zip(route_points, route_points[1:]):
            coordinates = f"{start.lng},{start.lat};{end.lng},{end.lat}"
            response = self.client.get(
                f"{self.base_url}/route/v1/{self.profile}/{coordinates}",
                params={
                    "overview": "full",
                    "geometries": "geojson",
                    "steps": "true",
                    "continue_straight": "true",
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

            leg = [GeoPointDto(lat=lat, lng=lng) for lng, lat in coordinates_list]
            if stitched:
                stitched.extend(leg[1:])
            else:
                stitched.extend(leg)

        return RoutePath(points=stitched)
