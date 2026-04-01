# Mission Planner API Spec

## Design Rules

- Server plans missions, does not fly them
- All in-flight calls are optional telemetry or event upload
- Android must be able to continue safely without server round-trips
- All responses are versioned and schema-first

## Base Path

`/v1`

## Authentication

Demo baseline:

- Bearer token header for authenticated operator sessions
- Server-to-app artifacts may also use signed download URLs

## Common Headers

- `Authorization: Bearer <token>`
- `X-Request-Id: <uuid>`
- `Content-Type: application/json`

## 1. POST /v1/missions/plan

Creates a mission plan from route intent and inspection targets.

### Request

```json
{
  "missionName": "building-a-demo",
  "origin": {
    "lat": 25.03391,
    "lng": 121.56452
  },
  "targetBuilding": {
    "buildingId": "tower-a",
    "label": "Tower A"
  },
  "routingMode": "road_network_following",
  "corridorPolicy": {
    "defaultHalfWidthM": 8.0,
    "maxHalfWidthM": 12.0,
    "branchConfirmRadiusM": 18.0
  },
  "flightProfile": {
    "defaultAltitudeM": 35.0,
    "defaultSpeedMps": 4.0,
    "maxApproachSpeedMps": 1.0
  },
  "inspectionIntent": {
    "viewpoints": [
      {
        "viewpointId": "vp-01",
        "label": "north-east-facade",
        "lat": 25.03441,
        "lng": 121.56501,
        "yawDeg": 225.0,
        "distanceToFacadeM": 12.0
      }
    ]
  },
  "demoMode": true
}
```

### 200 Response

```json
{
  "missionId": "msn_20260402_001",
  "bundleVersion": "1.0.0",
  "missionBundle": {
    "missionId": "msn_20260402_001",
    "routeMode": "road_network_following",
    "defaultAltitudeM": 35.0,
    "defaultSpeedMps": 4.0,
    "corridorSegments": [
      {
        "segmentId": "seg-001",
        "polyline": [
          { "lat": 25.03391, "lng": 121.56452 },
          { "lat": 25.03402, "lng": 121.56464 }
        ],
        "halfWidthM": 8.0,
        "suggestedAltitudeM": 35.0,
        "suggestedSpeedMps": 4.0
      }
    ],
    "verificationPoints": [
      {
        "verificationPointId": "vp-branch-001",
        "lat": 25.03412,
        "lng": 121.56472,
        "expectedOptions": ["LEFT", "STRAIGHT"],
        "timeoutMs": 2500
      }
    ],
    "inspectionViewpoints": [
      {
        "inspectionViewpointId": "inspect-001",
        "lat": 25.03441,
        "lng": 121.56501,
        "yawDeg": 225.0,
        "captureMode": "photo_burst"
      }
    ],
    "failsafe": {
      "onSemanticTimeout": "HOLD",
      "onBatteryCritical": "RTH",
      "onFrameDrop": "HOLD"
    }
  },
  "artifacts": {
    "missionKmzUrl": "/v1/missions/msn_20260402_001/artifacts/mission.kmz",
    "missionMetaUrl": "/v1/missions/msn_20260402_001/artifacts/mission_meta.json"
  }
}
```

### Validation Rules

- `routingMode` must be `road_network_following`
- `defaultAltitudeM` must be within legal demo envelope
- `defaultSpeedMps` must be positive and below app limit
- `viewpoints` must be non-empty

### Error Codes

- `400 invalid_request`
- `404 route_unavailable`
- `409 mission_generation_failed`
- `422 validation_error`
- `500 internal_error`

## 2. GET /v1/missions/{missionId}/artifacts/mission.kmz

Returns the mission KMZ artifact.

### 200 Response

- `Content-Type: application/vnd.google-earth.kmz`
- Body is a KMZ file generated from waypoint-compatible mission data

### Notes

- Initial implementation may return a mock KMZ artifact
- Generator abstraction must isolate future DJI-specific formatting

## 3. GET /v1/missions/{missionId}/artifacts/mission_meta.json

Returns the mission metadata artifact consumed by Android.

### 200 Response

```json
{
  "missionId": "msn_20260402_001",
  "bundleVersion": "1.0.0",
  "generatedAt": "2026-04-02T02:00:00Z",
  "segments": 12,
  "verificationPoints": 3,
  "inspectionViewpoints": 2,
  "safetyDefaults": {
    "semanticTimeout": "HOLD",
    "batteryCritical": "RTH",
    "frameDrop": "HOLD"
  }
}
```

## 4. POST /v1/flights/{flightId}/events

Uploads discrete flight events. These are not required for control.

### Request

```json
{
  "events": [
    {
      "eventId": "evt-001",
      "missionId": "msn_20260402_001",
      "type": "VERIFICATION_POINT_REACHED",
      "timestamp": "2026-04-02T02:10:31Z",
      "payload": {
        "verificationPointId": "vp-branch-001"
      }
    }
  ]
}
```

### 202 Response

```json
{
  "accepted": 1,
  "rejected": 0
}
```

## 5. POST /v1/flights/{flightId}/telemetry:batch

Uploads telemetry batches for replay, debug, and demo analytics.

### Request

```json
{
  "samples": [
    {
      "timestamp": "2026-04-02T02:10:30Z",
      "lat": 25.03410,
      "lng": 121.56470,
      "altitudeM": 34.6,
      "groundSpeedMps": 3.8,
      "batteryPct": 78,
      "flightState": "TRANSIT",
      "corridorDeviationM": 1.2
    }
  ]
}
```

### 202 Response

```json
{
  "accepted": 42
}
```

## DTO Notes

- Telemetry samples are append-only
- Event ingestion should be idempotent by `eventId`
- Mission IDs are server-issued
- Android should treat server responses as advisory data, not real-time commands

## Contract Stability

- Any breaking field change requires `bundleVersion` bump
- Android parser must reject unknown major versions
- Additive fields are allowed if they are optional

## Sprint 2 Skeleton Note

Current server skeleton behavior:

- mission artifacts are stored in memory
- `mission.kmz` is generated by a mock zip-based generator abstraction
- `MockRouteProvider` is the default local provider
- `OsmOsrmRouteProvider` exists behind the route provider abstraction for later wiring
