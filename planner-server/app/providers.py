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
        launch_point = request.launchPoint or request.origin
        if launch_point is None:
            raise RouteProviderError("launch point missing")

        points = [launch_point]
        points.extend(GeoPointDto(lat=waypoint.lat, lng=waypoint.lng) for waypoint in request.waypoints)
        points.append(launch_point)
        return RoutePath(points=points)


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
        launch_point = request.launchPoint or request.origin
        if launch_point is None:
            raise RouteProviderError("launch point missing")
        coordinate_points = [launch_point]
        coordinate_points.extend(GeoPointDto(lat=waypoint.lat, lng=waypoint.lng) for waypoint in request.waypoints)
        coordinate_points.append(launch_point)
        coordinates = ";".join(f"{point.lng},{point.lat}" for point in coordinate_points)
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

        return RoutePath(points=[GeoPointDto(lat=lat, lng=lng) for lng, lat in coordinates_list])
