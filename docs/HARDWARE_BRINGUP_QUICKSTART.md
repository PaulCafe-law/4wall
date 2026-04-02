# Hardware Bring-Up Quickstart

Use this quickstart when you want the shortest path from the current beta branch to a real-device bench session.

## 1. Prepare planner-server

Set production-safe environment variables first:

- `BUILDING_ROUTE_ENVIRONMENT=production`
- `BUILDING_ROUTE_DATABASE_URL`
- `BUILDING_ROUTE_AUTH_SECRET_KEY`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED=false`
- `BUILDING_ROUTE_ARTIFACT_BACKEND`
- `BUILDING_ROUTE_ROUTE_PROVIDER`

Run migrations:

```powershell
cd "D:\The Fourth Wall AI\codebase\planner-server"
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Create or update a field operator:

```powershell
cd "D:\The Fourth Wall AI\codebase\planner-server"
.\.venv\Scripts\python.exe .\scripts\create_operator.py --username fieldpilot --display-name "Field Pilot" --password "CHANGE_ME_NOW"
```

Update the password later with:

```powershell
.\.venv\Scripts\python.exe .\scripts\create_operator.py --username fieldpilot --display-name "Field Pilot" --password "NEW_SECRET" --update-password
```

Smoke test auth, mission planning, and authenticated artifact downloads:

```powershell
cd "D:\The Fourth Wall AI\codebase\planner-server"
.\.venv\Scripts\python.exe .\scripts\smoke_test.py --base-url https://YOUR-PLANNER-SERVER --username fieldpilot --password CHANGE_ME_NOW
```

## 2. Build Android prod debug

Use the wrapper script so the required Gradle properties are always passed:

```powershell
cd "D:\The Fourth Wall AI\codebase\android-app"
.\scripts\build-prod-debug.ps1 -DjiApiKey YOUR_DJI_KEY -PlannerBaseUrl https://YOUR-PLANNER-SERVER
```

Install to a connected device:

```powershell
.\scripts\build-prod-debug.ps1 -DjiApiKey YOUR_DJI_KEY -PlannerBaseUrl https://YOUR-PLANNER-SERVER -Install
```

## 3. Bench checklist

Before prop-on, confirm all of the following in prod mode:

- aircraft connected
- RC connected
- product type / firmware visible
- camera stream available
- GPS gate ready
- storage and device health clear
- mission bundle downloaded and verified
- `TAKEOFF` remains blocked whenever any gate fails

## 4. Stop conditions

Do not continue to field testing if any of these fail:

- DJI SDK registration does not complete
- authenticated mission planning fails
- artifact checksum validation fails
- unexplained state transition appears in the app
- blackbox or incident export does not capture the session
