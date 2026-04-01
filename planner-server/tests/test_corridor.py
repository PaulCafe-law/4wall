from app.corridor import CorridorGenerator, approx_distance_m, densify_polyline
from app.dto import GeoPointDto, MissionPlanRequestDto
from app.providers import MockRouteProvider
from tests.test_dto import valid_request_payload


def test_densify_polyline_adds_intermediate_points_for_long_segments() -> None:
    polyline = [
        GeoPointDto(lat=25.0, lng=121.0),
        GeoPointDto(lat=25.001, lng=121.001),
    ]

    densified = densify_polyline(polyline, max_spacing_m=20.0)

    assert len(densified) > len(polyline)
    assert densified[0] == polyline[0]
    assert densified[-1] == polyline[-1]


def test_corridor_generator_outputs_required_artifacts() -> None:
    request = MissionPlanRequestDto(**valid_request_payload())
    route = MockRouteProvider().plan_route(request)

    plan = CorridorGenerator().generate(request=request, route_path=route, mission_id="msn_test_001")

    assert plan.response.missionId == "msn_test_001"
    assert plan.response.missionBundle.corridorSegments[0].halfWidthM == 8.0
    assert len(plan.response.missionBundle.verificationPoints) == 1
    assert len(plan.response.missionBundle.inspectionViewpoints) == 1
    assert plan.mission_meta.segments == 1


def test_approx_distance_is_positive_for_distinct_points() -> None:
    start = GeoPointDto(lat=25.0, lng=121.0)
    end = GeoPointDto(lat=25.0005, lng=121.0005)

    assert approx_distance_m(start, end) > 0
