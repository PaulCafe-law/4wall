# Planner Server

FastAPI skeleton for mission planning.

## Endpoints

- `POST /v1/missions/plan`
- `GET /v1/missions/{missionId}/artifacts/mission.kmz`
- `GET /v1/missions/{missionId}/artifacts/mission_meta.json`
- `POST /v1/flights/{flightId}/events`
- `POST /v1/flights/{flightId}/telemetry:batch`

## Local Run

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

## Test

```powershell
pytest
```

## Bring-Up Helpers

```powershell
.\.venv\Scripts\python.exe .\scripts\create_operator.py --username fieldpilot --display-name "Field Pilot" --password "CHANGE_ME_NOW"
.\.venv\Scripts\python.exe .\scripts\smoke_test.py --base-url http://127.0.0.1:8000 --username fieldpilot --password CHANGE_ME_NOW
```

## Notes

- `MockRouteProvider` is the default provider so local demo flows do not depend on external routing
- `OsmOsrmRouteProvider` is present as the real provider abstraction
- KMZ output is a mock zip artifact for now, not a DJI production artifact
