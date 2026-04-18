# Web App

Desktop-first beta console for internal ops and invited customers.

## What It Covers

- invite acceptance and web login
- site list and site detail
- mission list, mission detail, and planner submission
- artifact visibility through mission detail
- manual invoice visibility
- internal organization and audit views

This app is never flight-critical. Android remains the runtime that owns preflight, execution, and failsafe behavior.

## Local Run

```powershell
Set-Location .\web-app
npm ci
npm run dev
```

Set `VITE_API_BASE_URL` to the local or deployed planner API URL before running against anything other than the default local backend.

If you want to use the internal Google Maps route editor or site-map preview, also set:

- `VITE_GOOGLE_MAPS_API_KEY`

## Test

```powershell
Set-Location .\web-app
npm run lint
npm run test
npm run build
```

E2E:

```powershell
Set-Location .\web-app
npx playwright install chromium
npm run test:e2e
```

## Release Notes

- Render deploy topology now lives in the repo-root [render.yaml](/D:/The%20Fourth%20Wall%20AI/codebase/render.yaml).
- `VITE_API_BASE_URL`, `VITE_APP_ENVIRONMENT`, and `VITE_GOOGLE_MAPS_API_KEY` are the required deploy-time inputs for the full control-plane experience.
- Production and staging smoke checks are driven by [smoke-beta.yml](/D:/The%20Fourth%20Wall%20AI/codebase/.github/workflows/smoke-beta.yml).
