# Planner Server Architecture

## Role

- route provider selection
- road-network path planning
- corridor and verification point generation
- mission persistence
- authenticated artifact delivery
- post-flight data ingestion

The server is explicitly not in the flight-critical loop. Android must remain able to continue, hold, RTH, or hand over without server availability.

## Runtime Layers

### API Layer

- FastAPI entrypoint in `planner-server/app/main.py`
- JWT bearer auth for protected endpoints
- request/response DTO validation via Pydantic

### Planning Layer

- `RouteProvider` abstraction with `MockRouteProvider` and `OsmOsrmRouteProvider`
- `CorridorGenerator` builds:
  - densified route polyline
  - corridor half width
  - suggested altitude and speed
  - verification points
  - inspection viewpoints

### Artifact Layer

- `MissionArtifactService` generates:
  - `mission.kmz`
  - `mission_meta.json`
- `ArtifactStorage` abstraction supports:
  - local filesystem for dev
  - S3-compatible object storage for prod
- artifact responses expose version + checksum in headers

### Persistence Layer

- SQLModel models backed by SQLite in dev
- compatible with Postgres via `BUILDING_ROUTE_DATABASE_URL`
- Alembic migration baseline under `planner-server/alembic/`

Persisted entities:

- `OperatorAccount`
- `RefreshToken`
- `Mission`
- `MissionArtifact`
- `Flight`
- `FlightEvent`
- `TelemetryBatch`

## Deploy Shape

### Development

- SQLite database
- local artifact directory
- bootstrap operator enabled
- mock route provider by default

### Production Beta

- Render web service
- managed Postgres via SQLAlchemy/SQLModel URL
- S3-compatible object storage
- bootstrap operator disabled
- OSRM provider enabled

## Safety Boundary

- no server-issued stick commands
- no server participation in takeoff gating beyond artifact/auth availability
- no continuous steering or SLAM logic
- any Android artifact verification failure must block takeoff locally
