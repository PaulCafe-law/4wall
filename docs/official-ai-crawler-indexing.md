# Official Website AI Crawler Indexing

This sprint makes the public `/official` website readable to search engines and AI
retrieval systems without exposing the authenticated management platform.

## Scope

- Public website only: `/official`, `/official.md`, `/llms.txt`, `/sitemap.xml`,
  and public official assets.
- Management routes remain authenticated and receive explicit `noindex` headers.
- No Android, planner-server, flight-critical runtime, or API behavior changes.

## Policy

The first rollout uses maximum public exposure for official marketing content:
AI crawlers and traditional search crawlers may read the public official website.
Authenticated routes such as `/login`, `/missions`, `/incidents`, `/site-map`,
and `/control-plane` are excluded through `robots.txt` and route-specific
`X-Robots-Tag` headers.

`robots.txt` is advisory and not a security boundary. Real protection still
depends on auth, API authorization, and avoiding any private data in static
public files.
