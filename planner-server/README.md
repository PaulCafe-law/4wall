# Planner Server

FastAPI service for planning, tenancy, web auth, artifacts, billing, audit, and flight data ingest.

## Primary Endpoints

- `GET /healthz`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/auth/me`
- `POST /v1/web/session/login`
- `POST /v1/web/session/refresh`
- `POST /v1/web/session/logout`
- `GET /v1/web/session/me`
- `GET/POST /v1/sites`
- `GET /v1/missions`
- `GET /v1/missions/{missionId}`
- `GET /v1/billing/invoices`
- `GET /v1/audit-log`
- flight ingest and artifact download endpoints

## Local Run

```powershell
Set-Location .\planner-server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

## Provision an Operator Account

Use the helper script instead of editing the database by hand:

```powershell
Set-Location .\planner-server
.\.venv\Scripts\python.exe .\scripts\create_operator.py --username fieldpilot --display-name "Field Pilot" --password "CHANGE_ME_NOW"
```

Update the password later only when intended:

```powershell
Set-Location .\planner-server
.\.venv\Scripts\python.exe .\scripts\create_operator.py --username fieldpilot --display-name "Field Pilot" --password "NEW_SECRET" --update-password --activate
```

## Test

```powershell
Set-Location .\planner-server
python -m pytest tests -q
```

## Smoke Paths

Operator artifact smoke:

```powershell
Set-Location .\planner-server
.\.venv\Scripts\python.exe .\scripts\smoke_test.py --base-url http://127.0.0.1:8000 --username fieldpilot --password CHANGE_ME_NOW
```

Web beta release smoke:

```powershell
Set-Location .\planner-server
.\.venv\Scripts\python.exe .\scripts\smoke_test.py --mode web-beta --base-url https://staging-api.example.com --web-email smoke@example.com --web-password CHANGE_ME --app-origin https://staging-app.example.com
```

Viewer read-only smoke:

```powershell
Set-Location .\planner-server
.\.venv\Scripts\python.exe .\scripts\smoke_test.py --mode web-viewer --base-url https://staging-api.example.com --web-email viewer@example.com --web-password CHANGE_ME --app-origin https://staging-app.example.com
```

## Release Notes

- `/healthz` is release-gating and returns `503` when DB connectivity is broken.
- `BUILDING_ROUTE_APP_ORIGIN` is required outside development/test for web session origin enforcement.
- Render service topology now lives in the repo-root [render.yaml](/D:/The%20Fourth%20Wall%20AI/codebase/render.yaml).
