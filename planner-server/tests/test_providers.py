from app.dto import MissionPlanRequestDto
from app.providers import MockRouteProvider, OsmOsrmRouteProvider
from tests.helpers import valid_request_payload


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


class FakeClient:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.calls: list[tuple[str, dict[str, str]]] = []

    def get(self, url: str, params: dict[str, str]) -> FakeResponse:
        self.calls.append((url, params))
        return FakeResponse(self.payload)


def test_mock_route_provider_returns_demo_path() -> None:
    provider = MockRouteProvider()
    request = MissionPlanRequestDto(**valid_request_payload())

    route = provider.plan_route(request)

    assert len(route.points) == len(request.waypoints) + 2
    assert route.points[0] == request.launchPoint
    assert route.points[-1] == request.launchPoint


def test_osm_osrm_provider_builds_expected_request_and_parses_geojson() -> None:
    fake_client = FakeClient(
        {
            "routes": [
                {
                    "geometry": {
                        "coordinates": [
                            [121.56452, 25.03391],
                            [121.56501, 25.03441],
                        ]
                    }
                }
            ]
        }
    )
    provider = OsmOsrmRouteProvider(base_url="https://example-osrm.local", client=fake_client)
    request = MissionPlanRequestDto(**valid_request_payload())

    route = provider.plan_route(request)

    called_url, called_params = fake_client.calls[0]
    assert called_url.startswith("https://example-osrm.local/route/v1/driving/")
    assert called_params["geometries"] == "geojson"
    assert len(route.points) == 2
    assert route.points[1].lng == 121.56501
