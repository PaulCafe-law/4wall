def valid_request_payload() -> dict:
    return {
        "missionName": "building-a-demo",
        "origin": {"lat": 25.03391, "lng": 121.56452},
        "targetBuilding": {"buildingId": "tower-a", "label": "Tower A"},
        "routingMode": "road_network_following",
        "corridorPolicy": {
            "defaultHalfWidthM": 8.0,
            "maxHalfWidthM": 12.0,
            "branchConfirmRadiusM": 18.0,
        },
        "flightProfile": {
            "defaultAltitudeM": 35.0,
            "defaultSpeedMps": 4.0,
            "maxApproachSpeedMps": 1.0,
        },
        "inspectionIntent": {
            "viewpoints": [
                {
                    "viewpointId": "vp-01",
                    "label": "north-east-facade",
                    "lat": 25.03441,
                    "lng": 121.56501,
                    "yawDeg": 225.0,
                    "distanceToFacadeM": 12.0,
                }
            ]
        },
        "demoMode": False,
    }
