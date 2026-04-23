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
    def __init__(self, payload: dict | list[dict]) -> None:
        self.payload = payload
        self.calls: list[tuple[str, dict[str, str]]] = []

    def get(self, url: str, params: dict[str, str]) -> FakeResponse:
        self.calls.append((url, params))
        if isinstance(self.payload, list):
            index = len(self.calls) - 1
            return FakeResponse(self.payload[index])
        return FakeResponse(self.payload)


def test_mock_route_provider_returns_demo_path() -> None:
    provider = MockRouteProvider()
    request = MissionPlanRequestDto(**valid_request_payload())

    route = provider.plan_route(request)

    assert len(route.points) == 4
    assert route.points[0].lat == request.launchPoint.location.lat
    assert route.points[-1].lat == request.launchPoint.location.lat


def test_osm_osrm_provider_builds_expected_request_and_parses_geojson() -> None:
    fake_client = FakeClient(
        [
            {
                "routes": [
                    {
                        "geometry": {
                            "coordinates": [
                                [121.56452, 25.03391],
                                [121.56472, 25.03412],
                            ]
                        }
                    }
                ]
            },
            {
                "routes": [
                    {
                        "geometry": {
                            "coordinates": [
                                [121.56472, 25.03412],
                                [121.56501, 25.03441],
                            ]
                        }
                    }
                ]
            },
            {
                "routes": [
                    {
                        "geometry": {
                            "coordinates": [
                                [121.56501, 25.03441],
                                [121.56452, 25.03391],
                            ]
                        }
                    }
                ]
            },
        ]
    )
    provider = OsmOsrmRouteProvider(base_url="https://example-osrm.local", client=fake_client)
    request = MissionPlanRequestDto(**valid_request_payload())

    route = provider.plan_route(request)

    called_url, called_params = fake_client.calls[0]
    assert called_url.startswith("https://example-osrm.local/route/v1/driving/")
    assert called_params["geometries"] == "geojson"
    assert len(fake_client.calls) == 3
    assert len(route.points) == 4
    assert route.points[-1].lng == 121.56452
