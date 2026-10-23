# Official website redesign: warehouse pivot

Date: 2026-10-23
Status: Live on www.4wall.io since 2026-10-23; current image `443981a-prod`
(copy polish, below).

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
- Contact remains `admin@4wall.io`; no LINE CTA; no pricing; no
  customer names without written consent.

## Public-copy policy

Set by the founder on 2026-10-23, replacing the earlier "label every number as
an estimate" policy (see "Capability-only rewrite" below). The page sells what the product does; it does not list what it cannot do.

- Write capabilities and buyer outcomes, framed around the planning decisions a
  goods-to-person AGV warehouse makes. A limitation is reframed as a true
  capability or left out; no disclaimers, "not yet", "cannot", "does not"
  lines, and no unpackaged "illustrative" stamps or footers.
- 4WALL AI is a simulator: never frame results around field calibration, field
  measurement or field results.
- Never name the AI model or vendor. Data handling is described by what the
  system does; full details are provided on request.
- Truth floor (unchanged): every claim traces back to the warehouse system's
  code and docs; no invented numbers, improvement percentages, customer names
  (和泰/安格), pricing, "optimal", "accurate" or "guaranteed" claims, nothing
  implying the product runs AGVs or the floor, and no unimplemented inputs.
- `officialCopy.lint.test.ts` enforces all of the above on every string, the
  crawler files and the page head.

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
- Outside this change: `platform.4wall.io` still shows the legacy login look
  and the platform shell still has factory metadata (tracked separately).

## Production deploy (2026-10-23)

- Founder approved "commit 後直接部署到 www.4wall.io".
- Source commit `6af9b7a` (branch `claude/official-warehouse-redesign`).
- Image `paul953206/4wall-web:6af9b7a-prod`, digest
  `sha256:63720a65fa8c48c2d42225c6acb2ad43043cc4b683da28a91ede6554a2a4fc50`,
  deployed through the Render web deploy hook with `imgURL` at 06:39 Asia/Taipei.
- The Render API key in the local CLI config had expired (July 2026), so deploy
  status was verified over HTTP and in a browser instead of the API.
- Production checks: `/` and `/en` 200 with the new prerendered pages; apex and
  `/official*` aliases redirect as before; `/login` still redirects to the
  platform; OG images, favicon, `llms.txt`, `official.md`, robots and sitemap
  return 200 (OG briefly 404 during the instance switch, then 200);
  `platform.4wall.io/` and `/healthz` 200. Chromium at 1440 (zh, en) and 390
  (zh): hydrated, canvas live, no console errors, no horizontal overflow; the
  platform login renders without official CSS.
- Rollback: redeploy `paul953206/4wall-web:fe39362-prod`
  (`sha256:f59de1c248da96a895ff529f554f24fbf66bccc6a474294b557d16d1efbb143d`).
- The branch was pushed to `origin/claude/official-warehouse-redesign` with the
  `PaulCafe-law` GitHub CLI login (the default git credential on this machine
  belongs to an account without write access).

## Copy polish (2026-10-23, #124)

- Founder feedback on the live site: the Chinese copy read like a translation,
  the toolkit was too detailed, casual phrasing (「沒差，就說沒差」) does not fit
  a formal B2B company, and contact is now `admin@4wall.io`.
- 212 copy edits (zh 173, en 39) in formal Taiwanese usage; the hero headline
  is unchanged. Toolkit rows state only the user benefit. The email changed in
  the site, crawler files, both JSON-LD blocks and the platform login help
  link. `official.md`, `llms.txt` and the zh OG card were regenerated.
- Verification: lint and type check clean; 299 tests in 55 files pass; build,
  prerender and 185 real-nginx routing checks pass on the production image.
- Deploy: `main` at `443981a`, image `paul953206/4wall-web:443981a-prod`
  (`sha256:e125f8677264dd7d71e04d9b38207edf7c0d8806b3eb8facd266509d44d4dee3`),
  Render deploy hook at 23:50 Asia/Taipei. This image also took the #123
  platform login restyle live.
- Production check: `/`, `/en`, OG cards, `llms.txt`, `official.md`, robots
  and sitemap 200; apex and `/official` redirect as before; the page hydrates
  with the canvas live, no console errors, no horizontal overflow; the only
  mailto is `admin@4wall.io`; 「沒差」 no longer appears.
- Rollback: redeploy `paul953206/4wall-web:6af9b7a-prod`.

## Capability-only rewrite (2026-10-23)

- Founder feedback on the live site: the copy listed what the product cannot do
  (no AGV control, not calibrated with site data, numbers are not results),
  carried raw 「示意」 labels, and named the AI vendor in the FAQ. A buyer would
  not order from that page. As a simulator, field calibration is not the
  framing; negative lines should be rewritten as capabilities or removed.
- Process: a founder critic, a 3PL-buyer critic and a capability miner (reading
  `D:\第四面牆倉儲系統` code and docs) fed two independent rewrites
  (decision-confidence and scenario-led); a judge merged them, and truth,
  founder and language reviewers checked the result. Truth fixes applied:
  simulation comparison does not vary the AGV count (only QuickJudge does), the
  AI recommendation is a stable default plus candidates to verify, the data
  answer lists everything stored, and file formats stay at the six verified.
- Sections: #numbers is now 應用情境 / Use cases (nine decisions a
  goods-to-person warehouse can rehearse, big line 「數秒預測 · 完整驗算。」);
  how-we-work is an engagement path ending in delivered results; the zebra
  tape is a hand-off into simulation; the FAQ leads with buyer questions and
  drops the AGV-control, field-results and vendor answers.
- UI: every 「示意」 stamp, the board footer and the footer disclaimer are gone;
  stamps are teal product labels; the chat demo's attachment chip is now a
  real batch edit (12 racks rise by 1 m, version bump, undoable) instead of a
  rejected batch.
- Policy enforcement: the copy lint bans negative narrative, disclaimers and
  vendor names in every string, the crawler files and `official.html`.
