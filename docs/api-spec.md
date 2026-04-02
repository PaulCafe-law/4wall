# Mission Planner API Spec

## Design Rules

- Server plans missions and serves artifacts. It does not fly the aircraft.
- Android remains safe without server round-trips during active flight.
- Artifact endpoints are authenticated in the beta baseline.
- All contracts are versioned and shared-schema driven.

## Base Path

`/v1`

## Authentication Model

Beta baseline:

- operator login with access token + refresh token
- bearer auth for mission planning, artifact fetch, event upload, and telemetry upload
- no signed URLs in the first beta

## Common Headers

- `Authorization: Bearer <token>`
- `X-Request-Id: <uuid>`
- `Content-Type: application/json`

## Auth Endpoints

### POST /v1/auth/login

```json
{
  "username": "operator-a",
  "password": "secret"
}
```

```json
{
  "accessToken": "jwt-access",
  "refreshToken": "jwt-refresh",
  "tokenType": "Bearer",
  "expiresInSeconds": 900
}
```

### POST /v1/auth/refresh

```json
{
  "refreshToken": "jwt-refresh"
}
```

```json
{
  "accessToken": "jwt-access-2",
  "refreshToken": "jwt-refresh-2",
  "tokenType": "Bearer",
  "expiresInSeconds": 900
}
```

## POST /v1/missions/plan

Creates a mission plan, persists mission records, and returns artifact references.

### Request

```json
{
  "missionName": "tower-a-prod-beta",
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
  "demoMode": false
}
```

### 201 Response

```json
{
  "missionId": "msn_20260402_001",
  "bundleVersion": "1.0.0",
  "artifacts": {
    "missionKmzPath": "/v1/missions/msn_20260402_001/artifacts/mission.kmz",
    "missionMetaPath": "/v1/missions/msn_20260402_001/artifacts/mission_meta.json",
    "checksum": "sha256:abc123",
    "artifactVersion": 1
  }
}
```

### Validation Rules

- `routingMode` must be `road_network_following`
- altitude and speed must remain inside the Android safety envelope
- viewpoint list must be non-empty

## GET /v1/missions/{missionId}/artifacts/mission.kmz

Returns the authenticated KMZ artifact.

### 200 Response

- `Content-Type: application/vnd.google-earth.kmz`
- `Cache-Control` set according to artifact versioning policy
- `ETag` or checksum header included

## GET /v1/missions/{missionId}/artifacts/mission_meta.json

Returns the authenticated mission metadata artifact.

### 200 Response

```json
{
  "missionId": "msn_20260402_001",
  "bundleVersion": "1.0.0",
  "artifactVersion": 1,
  "generatedAt": "2026-04-02T02:00:00Z",
  "checksum": "sha256:abc123",
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

## POST /v1/flights/{flightId}/events

Uploads discrete flight events. These never participate in real-time control.

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

## POST /v1/flights/{flightId}/telemetry:batch

Uploads telemetry for replay, incident review, and support tooling.

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

## Contract Stability

- Breaking shared-schema changes require a version bump.
- Android must reject unknown major versions.
- Artifact checksum mismatch invalidates the bundle.
- Additive optional fields are allowed.
