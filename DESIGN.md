# Design System - Desktop Web Beta

## Product Context

- **What this is:** A desktop-first planning and operations console for invited customers and internal operators managing site records, mission requests, artifacts, and manual invoices.
- **Who it's for:** Internal ops, support staff, invited customer admins, and read-only customer viewers.
- **Space/industry:** Mission planning, field operations, and customer support for a safety-constrained drone workflow.
- **Project type:** Dense web app with map-first planning workspace and admin-grade tables.

## Aesthetic Direction

- **Direction:** Industrial Editorial
- **Decoration level:** Intentional
- **Mood:** This should feel like a field dossier and control room, not a lifestyle SaaS dashboard. Structured, quiet, high-signal, and operationally serious.
- **Reference posture:** Borrow from mapping software, logistics consoles, and editorial data layouts, not generic startup dashboards.

## Typography

- **Display/Hero:** `Cabinet Grotesk`
  - Condensed authority for page headers and workspace labels without feeling corporate.
- **Body:** `Instrument Sans`
  - Neutral, readable, and slightly warmer than default system grotesks.
- **UI/Labels:** `Instrument Sans`
  - Keep controls and forms consistent with body copy.
- **Data/Tables:** `IBM Plex Mono`
  - Use for timestamps, mission IDs, artifact checksums, invoice numbers, and any tabular numeric data.
- **Code:** `JetBrains Mono`
- **Loading:** Self-host or use a CDN with explicit preload for `Cabinet Grotesk`, `Instrument Sans`, and `IBM Plex Mono`.
- **Scale:**
  - `xs`: 12px
  - `sm`: 14px
  - `md`: 16px
  - `lg`: 20px
  - `xl`: 28px
  - `2xl`: 40px

## Color

- **Approach:** Restrained
- **Primary:** `#0E6B69`
  - Oxidized teal for active state, selected map context, and primary actions.
- **Secondary:** `#B55C2B`
  - Rust accent for warnings, due states, and operational emphasis.
- **Neutrals:**
  - `#F4EFE7` paper
  - `#DED5C8` line
  - `#B0A79B` muted text
  - `#4A4F55` secondary surface
  - `#171B1F` base ink
- **Semantic:**
  - success `#1E7F53`
  - warning `#A56A16`
  - error `#B9382F`
  - info `#245F8F`
- **Dark mode:** Not part of beta. Keep a single high-contrast light theme until operational usage stabilizes.

## Spacing

- **Base unit:** 8px
- **Density:** Comfortable-compact
- **Scale:** `2xs(4)` `xs(8)` `sm(12)` `md(16)` `lg(24)` `xl(32)` `2xl(48)` `3xl(64)`

## Layout

- **Approach:** Grid-disciplined with editorial accents
- **Grid:** 12-column desktop grid, 8-column tablet grid
- **Max content width:** 1600px
- **Primary shell:**
  - left nav: 272px
  - center workspace: fluid
  - right rail: 360px
- **Border radius:**
  - `sm`: 4px
  - `md`: 8px
  - `lg`: 12px
  - avoid full-pill shapes except for tiny status chips

## Motion

- **Approach:** Minimal-functional
- **Easing:** `ease-out` for entrance, `ease-in` for exit, `ease-in-out` for panel movement
- **Duration:**
  - micro `80ms`
  - short `180ms`
  - medium `260ms`
- **Rule:** Motion should help users track panel swaps and map/detail transitions, not decorate the app.

## Component Rules

- **Navigation:** Use a stable left rail with section grouping. Do not collapse the whole app into a top-nav marketing shell.
- **Tables:** Favor compact rows, sticky headers, and monospace columns for IDs, timestamps, checksums, and money.
- **Forms:** Label above input, helper text below, validation states explicit, no floating labels.
- **Status chips:** Small, squared-off, text-first chips for `draft`, `planning`, `ready`, `failed`, `invoice_due`, `overdue`.
- **Map workspace:** Mission context on the left, map in the center, artifacts and checksums on the right.
- **Empty states:** Operational and directive. Tell the user what is missing and the next action.

## Responsive Rules

- **Desktop (`>=1280px`):** full three-panel workspace
- **Tablet (`768px` to `1279px`):** collapse right rail into tabs or drawer, keep mission list and map visible
- **Mobile (`<768px`):** unsupported in beta; show a clear unsupported message instead of a broken layout

## Anti-Patterns

- No purple gradients
- No glassmorphism
- No centered marketing hero layouts inside the app
- No giant floating CTA buttons
- No icon-in-circle feature-card patterns
- No uniform oversized border radius on every surface

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-10 | Use an industrial editorial system | The product is operational and safety-adjacent, so it needs clarity and authority more than friendliness theatre |
| 2026-04-10 | Keep a single light theme for beta | A second theme doubles state and contrast work without helping launch |
| 2026-04-10 | Make the map workspace the visual center | Mission planning and artifact context should dominate the product, not side widgets |
