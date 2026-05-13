# Mission Planner API Spec

## Design Rules

- Server plans routes, generates DJI waypoint mission artifacts, persists records, and serves authenticated downloads.
- Android remains outside the server control loop once the bundle is downloaded and verified.
- Artifact downloads use authenticated endpoints in beta. No signed URLs in this release.
- `mission.kmz` and `mission_meta.json` are versioned artifacts with checksum headers.

## Base Path

`/v1`

## Authentication

All endpoints except `/healthz`, `/v1/auth/login`, and `/v1/auth/refresh` require:

`Authorization: Bearer <accessToken>`

### POST /v1/auth/login

```json
{
  "username": "pilot",
  "password": "pilot-dev-only"
}
```

```json
{
  "accessToken": "jwt-access",
  "refreshToken": "jwt-refresh",
  "tokenType": "bearer",
  "expiresInSeconds": 900,
  "operator": {
    "operatorId": "op_123",
    "username": "pilot",
    "displayName": "Test Pilot"
  }
}
```

### POST /v1/auth/refresh

```json
{
  "refreshToken": "jwt-refresh"
}
```

Returns the same shape as login and rotates the refresh token.

### GET /v1/auth/me

Returns the authenticated operator profile.

## POST /v1/missions/plan

Creates a mission, persists mission and artifact records, writes artifacts to storage, and returns the mission bundle plus authenticated artifact references.

### Request

```json
{
  "missionName": "tower-a-prod-beta",
  "routingMode": "road_network_following",
  "launchPoint": null,
  "launchPointSource": "aircraft_home_point_at_takeoff",
  "returnHomeOnFinish": true,
  "operatingProfile": "outdoor_gps_patrol",
  "flightProfile": {
    "defaultAltitudeM": 10.0,
    "defaultSpeedMps": 1.5,
    "maxApproachSpeedMps": 1.0
  },
  "orderedWaypoints": [
    {
      "waypointId": "wp-1",
      "label": "North gate",
      "lat": 25.03421,
      "lng": 121.56501,
      "altitudeM": 10.0,
      "speedMps": 1.5,
      "headingDeg": 0.0,
      "dwellSeconds": 0
    },
    {
      "waypointId": "wp-2",
      "label": "East fence",
      "lat": 25.03441,
      "lng": 121.56531,
      "altitudeM": 10.0,
      "speedMps": 1.5,
      "headingDeg": 90.0,
      "dwellSeconds": 0
    }
  ],
  "demoMode": false
}
```

### 200 Response

```json
{
  "missionId": "msn_20260402_001",
  "bundleVersion": "2.1.0",
  "missionBundle": {
    "missionId": "msn_20260402_001",
    "routeMode": "road_network_following",
    "operatingProfile": "outdoor_gps_patrol",
    "launchPoint": null,
    "launchPointSource": "aircraft_home_point_at_takeoff",
    "orderedWaypoints": [
      {
        "waypointId": "wp-1",
        "label": "North gate",
        "location": { "lat": 25.03421, "lng": 121.56501 },
        "altitudeMeters": 10.0,
        "speedMetersPerSecond": 1.5,
        "headingDegrees": 0.0,
        "dwellSeconds": 0
      },
      {
        "waypointId": "wp-2",
        "label": "East fence",
        "location": { "lat": 25.03441, "lng": 121.56531 },
        "altitudeMeters": 10.0,
        "speedMetersPerSecond": 1.5,
        "headingDegrees": 90.0,
        "dwellSeconds": 0
      }
    ],
    "implicitReturnToLaunch": true,
    "returnHomeOnFinish": true,
    "defaultAltitudeMeters": 10.0,
    "defaultSpeedMetersPerSecond": 1.5,
    "failsafe": {
      "onSemanticTimeout": "HOLD",
      "onBatteryCritical": "RTH",
      "onFrameDrop": "HOLD"
    }
  },
  "artifacts": {
    "missionKmz": {
      "downloadUrl": "/v1/missions/msn_20260402_001/artifacts/mission.kmz",
      "version": 1,
      "checksumSha256": "abc123",
      "contentType": "application/vnd.google-earth.kmz",
      "sizeBytes": 2048,
      "cacheControl": "private, max-age=300"
    },
    "missionMeta": {
      "downloadUrl": "/v1/missions/msn_20260402_001/artifacts/mission_meta.json",
      "version": 1,
      "checksumSha256": "def456",
      "contentType": "application/json",
      "sizeBytes": 1536,
      "cacheControl": "private, max-age=300"
    }
  }
}
```

## GET /v1/missions/{missionId}/artifacts/mission.kmz

Returns the authenticated KMZ artifact.

### Headers

- `Content-Type: application/vnd.google-earth.kmz`
- `Cache-Control: private, max-age=300`
- `ETag: <checksum>`
- `X-Artifact-Version: 1`
- `X-Artifact-Checksum: <checksum>`

## GET /v1/missions/{missionId}/artifacts/mission_meta.json

Returns mission metadata JSON. The response body carries waypoint route metadata and artifact references; the response headers carry the authoritative checksum for the metadata file itself.

### Response body

```json
{
  "missionId": "msn_20260402_001",
  "bundleVersion": "2.1.0",
  "generatedAt": "2026-04-02T07:20:00Z",
  "waypointCount": 2,
  "launchPoint": null,
  "launchPointSource": "aircraft_home_point_at_takeoff",
  "implicitReturnToLaunch": true,
  "returnHomeOnFinish": true,
  "operatingProfile": "outdoor_gps_patrol",
  "suggestedAltitudeM": 10.0,
  "suggestedSpeedMps": 1.5,
  "safetyDefaults": {
    "onSemanticTimeout": "HOLD",
    "onBatteryCritical": "RTH",
    "onFrameDrop": "HOLD"
  },
  "artifacts": {
    "missionKmz": {
      "downloadUrl": "/v1/missions/msn_20260402_001/artifacts/mission.kmz",
      "version": 1,
      "checksumSha256": "abc123",
      "contentType": "application/vnd.google-earth.kmz",
      "sizeBytes": 2048,
      "cacheControl": "private, max-age=300"
    },
    "missionMeta": {
      "downloadUrl": "/v1/missions/msn_20260402_001/artifacts/mission_meta.json",
      "version": 1,
      "checksumSha256": "published-via-header",
      "contentType": "application/json",
      "sizeBytes": 1536,
      "cacheControl": "private, max-age=300"
    }
  }
}
```

## POST /v1/flights/{flightId}/events

Uploads discrete flight events. These are persisted for replay and incident review only.

### Request

```json
{
  "missionId": "msn_20260402_001",
  "events": [
    {
      "eventId": "evt-001",
      "type": "VERIFICATION_POINT_REACHED",
      "timestamp": "2026-04-02T07:25:31Z",
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

Uploads telemetry batches for replay, support, and blackbox-style reconstruction.

### Request

```json
{
  "missionId": "msn_20260402_001",
  "samples": [
    {
      "timestamp": "2026-04-02T07:25:30Z",
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
  "accepted": 1
}
```
