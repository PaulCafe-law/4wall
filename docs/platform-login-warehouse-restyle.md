# Platform login restyle: warehouse visual language

Date: 2026-10-23
Status: Implemented and verified locally; PR open, not merged or deployed.

## Request and scope

`www.4wall.io` was redesigned for the warehouse pivot
([official-warehouse-redesign.md](official-warehouse-redesign.md)). Its primary
"開始使用" button opens `https://platform.4wall.io`, whose root still shows the
legacy web-app login: IBM Plex/Space Grotesk stacks, the chrome/ember/moss
palette, drone-era copy ("飛行關鍵迴路"), the default Vite favicon, and factory
metadata in the platform shell. Visitors cross a visual and narrative seam.

Founder decisions, 2026-10-23 (asked before any change, because the saved rule
is not to touch the management platform without asking):

1. The warehouse system (`D:\第四面牆倉儲系統`) will be deployed at
   `https://platform.4wall.io`, so warehouse wording on the login is correct.
2. Restyling the platform login is approved, limited to the login surface.

This is a Sprint 4 web change limited to `web-app/` and `docs/`.
Checkpoint: `checkpoint/platform-login-restyle-20261023` at `b8b9520`
(`origin/main`). Work branch: `claude/platform-login-warehouse-restyle`.

## Gaps

1. `LoginPage` uses the shared `Panel`, `Field`, `Input` and `ActionButton`
   styles (rounded-2xl/full, ember focus, moss button, `bg-grain`) and a dark
   chrome hero. Changing those shared components would restyle the whole
   platform, so the login needs its own presentational markup.
2. Login copy describes the drone planning console ("桌面任務規劃",
   "桌面應用維持在飛行關鍵迴路之外", "人工帳務").
3. The platform root shows a "正在恢復登入狀態" card in the legacy style for a
   moment before the login appears.
4. `web-app/index.html` (the platform shell) has the factory title,
   description, Open Graph text and JSON-LD description, and the Vite favicon.
5. The platform never loads its referenced web fonts; Inter and Noto Sans TC
   must be loaded without blocking the shell or affecting other pages.

## Invariants (must not change)

- Authentication: login form fields, validation messages, `auth.login`, the
  fixed post-login destinations (`/line/link` for `lineLink=1`, else
  `/overview`), cookies, session restoration, and LINE account linking.
- Routing: the redirect rules in
  [platform-domain-migration.md](platform-domain-migration.md) (root login at
  `/`, `/login` aliases, legacy-host redirects) and nginx templates.
- Platform pages stay `noindex` (nginx `X-Robots-Tag`; unchanged).
- Accessible names used by tests: heading `登入`, labels `帳號或電子郵件` and
  `密碼`, button `進入主控台`, the expired-session notice, and the restoring
  heading `正在恢復登入狀態`.
- Prerender compatibility on `main`, where `scripts/prerender-official.mjs`
  still uses `dist/index.html` as its template: keep `<div id="root"></div>`,
  `<html lang="zh-Hant-TW">`, the canonical/og tag shapes, and the 4-space
  JSON-LD indent. After the redesign lands, `official.html` is the template and
  `index.html` is the platform shell only.
- Shared `components/ui` styles and every authenticated page are unchanged.
  The `SessionRestoring` card used by authenticated routes keeps its look.

## Intended behaviour

- Visual: white page, hairline `#e5e7eb` borders, ink `#111`, muted `#6b7280`,
  teal `#08766c` primary (hover `#065f57`), 9px radius on buttons and inputs,
  teal focus ring, the layers mark and "4WALL AI" wordmark as on
  `www.4wall.io`, and a "回到官網" link to `https://www.4wall.io/`.
- Typography: Inter + Noto Sans TC. The Google Fonts stylesheet (the same
  families the official site loads) is appended once, without blocking, when
  the login or its restoring state mounts; other platform pages do not load it.
- Copy (Traditional Chinese): a neutral warehouse-platform introduction
  ("倉庫模擬與規劃的工作區") with three facts that are true today: accounts are
  invite-only, a desktop browser is recommended, and login help goes to
  `admin@4wall.io`. No feature, accuracy or KPI claims.
- Expired-session and error notices use the warehouse system's warn/error
  colours. The invite link text and `/invite` target are unchanged.
- Platform root restoring state: a login-styled card (`LoginRestoring`) is
  shown only by `PlatformHome`; authenticated routes keep `SessionRestoring`.
- Platform shell: neutral title and description ("4WALL AI 平台"), matching
  Open Graph text, the redesign's vetted organization description in JSON-LD,
  and `/official-assets/favicon-4wall.svg` (the same file the redesign adds).

## Out of scope / follow-ups

- `/invite`, `/signup` and `/line/link` keep the legacy look; restyle them in
  a follow-up if the founder wants the whole anonymous surface aligned.
- `og:image` in the platform shell still points at the factory illustration.
  After the redesign merges, point it at `og-4wall-warehouse-zh.png` and
  remove the illustration.
- The platform app behind the login is still the legacy product until the
  warehouse system is deployed there.

## Acceptance

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass in
  `web-app`; `routes.test.tsx` and all auth tests pass unchanged.
- Browser screenshots of the login at 1440px and 390px shown to the founder.
- PR opened against `main`; no merge or deploy without the founder.

## Verification record (2026-10-23)

- `npm run lint` and `npm run typecheck` clean. `npm test`: all 269 tests in
  51 files pass (268 before, plus one new `LoginPage` test that validation
  errors set `aria-invalid` and describe their input). `routes.test.tsx` and
  the existing auth tests pass unchanged.
- `npm run build` and the prerender pass. `dist/index.html` carries the new
  platform title and favicon; `dist/official/index.html` still receives its
  own title, Open Graph text and JSON-LD `@graph` from the prerender.
- Browser (Vite dev server, `/login`, Playwright Chromium): 1440×900 and
  390×844, plus 390 px with the expired notice and validation errors. Inter
  and Noto Sans TC load, the button computes to `rgb(8, 118, 108)` with a
  9px radius, no horizontal overflow, and no console errors. Screenshots were
  shown to the founder in the session.
- Not covered locally: the `platform.4wall.io` hostname itself (the root
  rendering is covered by `routes.test.tsx`), real sign-in, and LINE linking.
  No authentication code paths changed.
