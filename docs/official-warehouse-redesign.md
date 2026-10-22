# Official website redesign: warehouse pivot

Date: 2026-10-23
Status: Implemented and verified locally (branch `claude/official-warehouse-redesign`, uncommitted); production deploy awaits founder review.

## Request and scope

The founder asked for a full redesign of `https://www.4wall.io` (Chinese at `/`, English at `/en`):

- The company has pivoted. The product is now the 4WALL warehouse system
  (`D:\第四面牆倉儲系統`): upload existing warehouse files → AI builds a
  parametric 3D warehouse → edit by chat → simulation comparison
  (world-model rehearsal) → AI QuickJudge KPI forecast → simulator
  verification, plus the asset library and AGV path planning. The factory
  content now on the site (machine data, HMI OCR, LINE agent, factory twin,
  customer case, pricing) is legacy and must be removed from public pages.
- B2B AI startup, but not a boring B2B site; references: TypeSafe AI and
  Fuzzco. Animation is a core requirement.
- Visual coordination with the warehouse platform (Inter, ink, teal `#08766c`)
  because "Get started" goes from `www.4wall.io` to `https://platform.4wall.io`.

This is a Sprint 4 web change limited to `web-app/` and `docs/`.
Checkpoint: `checkpoint/official-warehouse-redesign-20261023` at `b8b9520`
(`origin/main`). Work branch: `claude/official-warehouse-redesign`. Unrelated
local changes (`.codex/config.toml`, untracked `output/`, video folders) are
excluded.

## Gaps

1. Copy, structured data, social metadata, `llms.txt`, `official.md`, and the
   official page tests describe the legacy factory product.
2. The page is image-led and static; there is no motion system.
3. Fonts referenced by the app (IBM Plex/Space Grotesk) are never loaded; the
   official page needs real CJK display fonts without slowing the platform.
4. The social image and hero preload point at a factory illustration.
5. `platform.4wall.io` currently shows the legacy web-app login, whose visual
   language (IBM Plex, chrome/ember/moss) does not match the warehouse system.
   Changing the platform is out of scope without the founder's decision.

## Invariants (must not change)

- Routing: `/` and `/en` on `www.4wall.io`/`4wall.io`; `/official` and
  `/official/en` aliases and their redirects; platform host behaviour; nginx
  template and `verify-platform-routing.mjs` expectations.
- Prerender: `scripts/prerender-official.mjs` writes
  `dist/official/index.html` and `dist/official/en/index.html` from
  `renderToString`; canonical, hreflang, OG, and JSON-LD stay correct per
  locale. No `window`/`document` access at module scope.
- Crawler surface: robots/sitemap entries unchanged; `llms.txt` and
  `official.md` keep the canonical URLs and contain no credentials.
- Links to the platform use `https://platform.4wall.io` with `rel="nofollow"`.
- Contact remains `4wallaitech@gmail.com`; no LINE CTA; no pricing; no
  customer names without written consent.

## Public-claim policy

All copy is checked against the warehouse system's own README and docs.
Every KPI shown on the site is labelled as a simulated forecast or an
illustration. Forbidden: calibrated accuracy, improvement percentages,
"optimal" claims, customer names (和泰/安格), pricing, cloud SaaS or
multi-tenant claims, "data never leaves the machine", unimplemented inputs
(DWG/DXF/BIM/point clouds), and "QuickJudge works on any warehouse".

## Intended behaviour

- New single-page site with a canvas isometric warehouse that builds itself,
  retro-OS UI windows, Bayer-dithered teal fields, wordmark scramble, a
  scroll-driven six-step product story, and count-up capability figures.
- Motion respects `prefers-reduced-motion`, pauses offscreen and in hidden
  tabs, caps device-pixel ratio at 2, and never blocks the headline (LCP is
  text). Prerendered HTML is fully readable without JavaScript.
- Fonts (Inter Tight, Noto Sans TC, Noto Serif TC, JetBrains Mono) load only
  on official pages.

## Acceptance

- Web lint, type check, unit tests (updated official tests), production build
  and prerender pass; nginx routing verification still passes.
- Browser check at 1440, 1024, 768 and 390 px in both locales; reduced-motion
  check; no console errors; language switch and platform links work.
- Independent review of copy accuracy, accessibility, performance and routing.
- Production deploy only after the founder approves the preview.

## Implementation notes

- Design: a three-concept judge panel (blueprint OS / single-signal editorial /
  floor-plan narrative) picked the floor-plan narrative ("一張地板：平面圖會站
  起來"); the build spec grafted the best ideas of the other two.
- `web-app/official.html` + `src/official/main.tsx` is a separate Vite entry
  that hydrates the prerendered page (about 100 KB gzip of JS on first load
  instead of the ~1 MB platform bundle). The platform router lazy-loads
  `OfficialSitePage` only for `/official` on SPA hosts, so the platform shell
  carries no official CSS or motion chunks.
- `scripts/prerender-official.mjs` renders both locales into
  `dist/official/{,en/}index.html`, writes per-locale fonts, OG and JSON-LD,
  regenerates `official.md`/`llms.txt` from `officialContent`, and deletes the
  unfilled template. `scripts/build-official-text.mjs` refreshes the committed
  crawler files; `scripts/render-og.mjs` renders the 1200×630 OG cards.
- `PRIMARY_CTA` is `'start'` (Get started → `https://platform.4wall.io` is the
  filled button) at the founder's request; flip it in `officialConfig.ts` to
  make "Book a demo" primary.
- Deliberate deviation from the spec: no offscreen static cache for the canvas
  (C1.5). Measured frames cost about 1–2 ms (p95 ≤ 2.4 ms), and caching racks
  would break AGV occlusion behind them.
- Ten unused factory images were removed from `public/official-assets/`. The
  factory illustration stays because the platform shell `index.html` still uses
  it as its `og:image`.

## Verification record (2026-10-23)

- Web type check and ESLint clean. All 298 tests in 55 files pass (was 268 in
  51), including SSR in a Node environment, zero hydration mismatches in both
  locales, the copy lint (legacy terms, customer names, overclaims), crawler
  files identical to the generator, and the chat/slot/hash regressions below.
- Production build and prerender pass. Real nginx image
  (`4wall-web:redesign-local`): `verify-platform-routing.mjs` passed all 185
  checks; OG images, favicon and crawler files return 200; `/official.html`
  redirects like any unknown path; platform root unchanged.
- Browser checks (Playwright, built preview): 1440, 1024, 768 and 390 px in
  both locales, reduced motion and JavaScript disabled — no console errors, no
  horizontal overflow, content readable without JS.
- Independent five-lens review (copy honesty, routing/SEO, accessibility/SSR,
  React runtime, canvas engine) with adversarial verification: 43 findings
  confirmed, 42 fixed and re-verified (16 interaction checks pass), 1 declined
  (static cache, above). Notable copy fixes: the data-flow FAQ now lists what
  the warehouse app actually sends to OpenAI (tables of 48 rows or fewer are
  sent whole; chat edits send the object list); "every number has a typical
  error" is scoped to AI QuickJudge; ties are described as the product behaves
  (marked as a tie, default rule set suggested).
- Not done: production deploy (awaiting founder approval of the preview);
  `platform.4wall.io` still shows the legacy login look and the platform shell
  still has factory metadata — both outside this change.
