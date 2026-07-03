# Web App

Desktop-first beta console for internal ops and invited customers.

## What It Covers

- invite acceptance and web login
- site list and site detail
- mission list, mission detail, and planner submission
- artifact visibility through mission detail
- manual invoice visibility
- internal organization and audit views
- native `/factory-twin` page for the Mirror Factory / 靚程工廠 demo

This app is never flight-critical. Android remains the runtime that owns preflight, execution, and failsafe behavior.

## Factory Twin Integration

`/factory-twin` is a native Fourth Wall platform page, not an iframe and not a separate Render service. It ports the Mirror Factory core frontend into `src/features/factory-twin` and uses the existing web login, app shell, and camera API client.

Production scope for this first version:

- Loads `public/factory-twin-assets/assets/factory.glb` and `public/factory-twin-assets/assets/amr.glb` from the web app.
- Runs chat commands through a local rule-based provider for the demo commands: person lookup, HC600 status, dispatch, and clear overlays.
- Runs the P3 simulation and agent notifications in the browser, without a Fastify sidecar or WebSocket supervisor.
- Maps the existing Fourth Wall fixed-camera metadata to the HC600-01 detail panel.
- Includes P2 warehouse simulation as an independent mode.
- Excludes the knowledge graph UI/API and offline demo-render route from the production page.

If always-on agent behavior, live LINE push, or LLM reasoning is needed later, move that logic into the existing planner/API service instead of adding a new Mirror Factory Render service.

## Local Run

```powershell
Set-Location .\web-app
npm ci
npm run dev
```

Set `VITE_API_BASE_URL` to the local or deployed planner API URL before running against anything other than the default local backend.
Set `VITE_GOOGLE_MAPS_API_KEY` when running Google Maps editing flows.

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
- `VITE_API_BASE_URL` and `VITE_APP_ENVIRONMENT` are build-time inputs for the Docker image.
- `VITE_GOOGLE_MAPS_API_KEY` is injected at Docker runtime through `/runtime-config.js` so Render can rotate the browser key without rebuilding the image.
- Production and staging smoke checks are driven by [smoke-beta.yml](/D:/The%20Fourth%20Wall%20AI/codebase/.github/workflows/smoke-beta.yml).
