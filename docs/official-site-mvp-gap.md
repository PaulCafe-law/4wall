# Official Site MVP Gap Note

## Decision

The public Fourth Wall AI website will be added as `web-app` route `/official`.
The existing `/` application entry remains owned by the authenticated management
platform and continues to redirect through the current auth flow.

## Scope

- Add a public, unauthenticated official website page inside `web-app`.
- Keep the page visually aligned with the current management platform: `bg-grain`,
  chrome/ember/moss tokens, rounded panels, restrained badges, and existing button
  proportions.
- Use route-local metadata updates for title, description, and Open Graph fields.
- Search source/docs/config examples for the old public contact email and replace
  only relevant source text if found.
- Use optimized public images under `/official-assets/` sourced from the
  existing Fourth Wall AI GitHub website asset repository to make the official
  page image-led instead of text-only. The asset directory intentionally does not
  match `/official` so nginx does not redirect the SPA route as a static folder.

## Out of Scope

- No changes to `android-app`.
- No changes to the flight-critical runtime.
- No changes to planner-server API, auth, or database behavior.
- No replacement of the existing `/`, `/login`, dashboard, operations, incident,
  mission, or site-map flows.
- No new Render service is required for this route. Deployment can reuse the
  existing web app image/static host as long as SPA fallback continues to serve
  `index.html`.

## Implementation Notes

The official page should feel like a public explanation surface for the same
operations product, not a separate marketing site. It should use the management
platform's density, typography, panel model, and muted operational language while
presenting the updated positioning: construction site inspection and daily
factory Digital Twin operations.
