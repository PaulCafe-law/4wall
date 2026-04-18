from app.corridor import CorridorGenerator, approx_distance_m, densify_polyline
from app.dto import GeoPointDto, MissionPlanRequestDto
from app.providers import MockRouteProvider
from tests.helpers import valid_request_payload


def test_densify_polyline_adds_intermediate_points_for_long_segments() -> None:
    polyline = [
        GeoPointDto(lat=25.0, lng=121.0),
        GeoPointDto(lat=25.001, lng=121.001),
    ]

    densified = densify_polyline(polyline, max_spacing_m=20.0)

    assert len(densified) > len(polyline)
    assert densified[0] == polyline[0]
    assert densified[-1] == polyline[-1]


def test_corridor_generator_outputs_closed_route_metadata() -> None:
    request = MissionPlanRequestDto(**valid_request_payload())
    route = MockRouteProvider().plan_route(request)

    plan = CorridorGenerator().generate(request=request, route_path=route, mission_id="msn_test_001")

    assert plan.mission_bundle.missionId == "msn_test_001"
    assert plan.mission_bundle.corridorSegments[0].halfWidthMeters == 8.0
    assert len(plan.mission_bundle.verificationPoints) == 2
    assert plan.mission_bundle.launchPoint == request.launchPoint
    assert plan.mission_bundle.waypointCount == len(request.waypoints)
    assert plan.mission_bundle.implicitReturnToLaunch is True
    assert route.points[0] == request.launchPoint
    assert route.points[-1] == request.launchPoint
    assert plan.mission_meta.corridorHalfWidthM == 8.0
    assert plan.mission_meta.routeWaypointCount == len(request.waypoints)
    assert plan.mission_meta.implicitReturnToLaunch is True


def test_approx_distance_is_positive_for_distinct_points() -> None:
    start = GeoPointDto(lat=25.0, lng=121.0)
    end = GeoPointDto(lat=25.0005, lng=121.0005)

    assert approx_distance_m(start, end) > 0
