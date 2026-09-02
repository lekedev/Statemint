# Statemint: Frontend Redesign (Dual-Theme, Copilot-Inspired)

**Status:** Approved
**Date:** 2026-09-02
**Sub-project:** 2 of 2 (the first, "fix, harden, deploy," is a separate, still-in-progress
effort — see `docs/superpowers/specs/2026-09-01-fix-harden-deploy-design.md`)

## Context

Sub-project 1 (fix/harden/deploy) explicitly deferred "make it unique" to a later cycle
so new feature/UI work wasn't built on code that wasn't yet trusted. With that work
substantially complete (all 17 code-level tasks done, deployment to Railway + Netlify
in progress), the user asked to redesign the frontend, calling the current UI "nothing
to write home about." They provided `https://www.copilot.money/` as a visual reference,
and three screenshots (landing hero, dashboard, transactions + split-transaction modal)
that were studied directly since the live site wouldn't render reliably through browser
automation (a heavy animation loop kept timing out screenshot capture).

## Reference: what was extracted from Copilot Money

- **Marketing/landing:** dark navy background, large bold rounded headline type,
  colorful floating pill-shaped tags with emoji as a signature motif, minimal top nav,
  bright blue CTA.
- **App/dashboard (light mode):** clean white background, left sidebar nav with
  icon+label items and a grouped account list (colored dot per account type), main area
  as a card grid — each card has a clear label, a big number, a sparkline/line chart
  with timeframe tabs, soft rounded corners and subtle shadows, generous padding.
- **Transactions:** grouped-by-date list, colored category pill badges as the recurring
  visual signature, checkbox selection, right-side detail panel, clean modals (segmented
  toggle, simple form layout).

Approved direction: apply this card/sidebar/pill visual language to Statemint, in
**both** a dark and a light theme (not picking one), keeping Statemint's existing green
(`#00D97E`) brand accent and its existing category color palette
(`#00D97E, #60A5FA, #F59E0B, #F87171, #A78BFA, #34D399, #FB923C, #38BDF8`).

## Audit of the current frontend

Read directly from `apps/web` during this design session:

- **`app/globals.css`** already has a considered dark-mode design-token system: CSS
  custom properties (`--bg`, `--surface`, `--surface-2`, `--border`, `--green`,
  `--red`, `--yellow`, `--blue`, plus dim/glow variants) and utility classes (`.card`,
  `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.label`, `.badge-*`).
- **Most components ignore those tokens** and hardcode inline `style={{ color: '#fff',
  background: 'rgba(255,255,255,0.06)', ... }}` throughout — `AppShell.tsx`,
  `Sidebar.tsx`, `app/dashboard/page.tsx`, `app/analytics/[id]/page.tsx`,
  `UploadZone.tsx`. This is why a theme toggle can't just be added on top — most of the
  UI wouldn't respond to it.
- **`app/auth/register/page.tsx` is a real, pre-existing inconsistency bug**: it's
  styled in plain light-mode Tailwind (`bg-gray-50`, `text-gray-900`, `bg-green-600`)
  while `app/auth/login` (via `AuthContainer` and its sub-components) and every other
  page are dark-themed. Registering currently looks like a different, unfinished app.
- **`components/ui/StatCard.tsx` is dead code**: styled in the same inconsistent
  light-Tailwind convention as the register page, and not imported anywhere — both
  `dashboard/page.tsx` and `analytics/[id]/page.tsx` define their own inline stat-box
  markup instead of using it.
- **`app/analytics/[id]/page.tsx` already has strong bones**: 4 stat boxes, a recharts
  bar chart for monthly in/out flow, a category breakdown with colored dot + progress
  bar per category (already close to the pill-badge idea), a top-merchants list, and an
  "ask your statement" AI chat widget. This page needs re-skinning, not rebuilding.
- **`Sidebar.tsx` links to `/tax` and `dashboard/page.tsx`'s "Tax" button links to
  `/tax/:id`, but `app/tax/` does not exist at all.** The Tax Calculator page has never
  been built on the frontend, despite the API already fully supporting it (see below).
  This is a functional gap, not just a styling one.
- The API's tax endpoints (`GET /api/tax/states`, `GET /api/tax/:documentId/detect`,
  `POST /api/tax/:documentId/calculate`, `GET /api/tax/:documentId/summary`,
  `GET /api/tax/guide/:stateKey`) already return a rich shape: band-by-band breakdown,
  a deductions list (pension/NHF/NHIS/rent relief/life insurance, each with an
  `applicable` flag and `saves` amount), a document checklist, and a state-specific
  payment guide with step-by-step filing instructions. None of this has a frontend yet.

## Goals

- Support both a dark and a light theme, toggleable, persisted across visits.
- Apply the Copilot-inspired visual language (card grid, sidebar nav, colored category
  pills, sparkline/chart treatment) consistently across every page.
- Fix the register-page and dead-`StatCard` inconsistencies discovered above as part of
  the same pass, since leaving them would undermine the redesign's consistency goal.
- Build the Tax Calculator page from scratch, matching the new design language, backed
  by the API endpoints that already exist.

## Non-goals

- Changing the API — this is a frontend-only redesign; all backend endpoints and
  response shapes already support what's needed.
- Redesigning the marketing/landing experience — Statemint's `app/page.tsx` is just an
  authenticated-redirect splash screen (spinner → `/dashboard` or `/auth/login`), not a
  public marketing site; Copilot's landing-page treatment (floating pill tags, huge
  headline) is not in scope here, only its app-interior patterns (sidebar, cards, pills).
- New backend features. If the tax calculator page's design surfaces a genuine gap in
  what the API returns, that's a new, separately-scoped finding — not assumed away here.

## Design

### 1. Theming architecture

A `ThemeProvider` (React context, `apps/web/lib/theme.tsx` or similar) sets a
`data-theme="dark"|"light"` attribute on `<html>`, persisted to `localStorage`
(key: `statemint_theme`), defaulting to `dark` — dark is the app's current identity;
light is the new option, not the new default. `globals.css` keeps its existing CSS
custom properties as the dark values under `:root`, and gains a `[data-theme="light"]`
block overriding backgrounds (white / `#F7F8FA`), text (near-black / muted grays),
and borders (light gray) — the green accent (`--green`) and the category color palette
stay the same in both themes for brand/data consistency. No Tailwind `dark:` utility
classes are introduced; the codebase already has a CSS-variable pattern in
`globals.css`, and extending that is less churn than adding a second theming mechanism
alongside it.

### 2. Component migration and cleanup

Every component currently using hardcoded inline hex/rgba colors is migrated to
reference the CSS variables instead (`var(--bg)`, `var(--surface)`, `var(--gray-1)`,
etc.) — required for the toggle to actually work everywhere, not just on whatever
happens to get special-cased. In scope: `AppShell.tsx`, `Sidebar.tsx`,
`app/dashboard/page.tsx`, `app/analytics/[id]/page.tsx`, `UploadZone.tsx`, plus the
login components under `app/auth/login/components/`.

`components/ui/StatCard.tsx` is deleted (dead, and styled in the wrong/inconsistent
convention). The inline stat-box patterns duplicated across `dashboard/page.tsx`
(`StatBox`-shaped markup) and `analytics/[id]/page.tsx` (`StatBox` function) are
consolidated into one shared, token-based `<StatCard>` component used by both pages
(and the new tax page).

A new shared `<Pill>` component (colored rounded badge, matching Copilot's category-tag
look — background at ~10-15% opacity of a color, text in the full color) replaces the
ad-hoc badge/dot markup scattered across the dashboard's `StatusBadge`, the analytics
page's category-color dots, and any tax-page category/status indicators.

The sidebar footer gains a small sun/moon theme-toggle button next to the existing
"Sign out" button, calling the `ThemeProvider`'s toggle function.

### 3. Page-by-page

- **`app/auth/register/page.tsx`**: rewritten to match the login page's actual theme
  and the new token system — currently the only page that looks like a different,
  broken app.
- **`app/auth/login` (`AuthContainer` + sub-components)**: restyled to the new token
  system; structure (two-panel layout with `LeftPanel`/`RightPanel`,
  `FloatingStat`, `LoginForm`) is kept, since it's already a considered design, not
  boilerplate.
- **`app/dashboard/page.tsx`**: re-skinned in place — same data (stat totals, upload
  zone, statement list) — using the new `<StatCard>`, `<Pill>` for status badges, and
  token-based card styling instead of inline hex.
- **`app/analytics/[id]/page.tsx`**: re-skinned in place — same data and chart
  structure (recharts bar chart, category breakdown, top merchants, AI chat widget) —
  category color-dots become `<Pill>`s, all inline hex replaced with tokens.
- **`app/tax/[id]/page.tsx` (new)**: built from scratch against the existing API
  endpoints. Structure:
  - An intake form (user type PAYE/self-employed/business, state of residence dropdown
    sourced from `GET /api/tax/states`, optional monthly rent and life insurance
    fields), pre-filled where possible using `GET /api/tax/:documentId/detect`'s
    suggested type/income.
  - On submit (`POST /api/tax/:documentId/calculate`), a results view: a tax-band
    breakdown (using the card/pill language), a deductions list (each with its
    `applicable` state and `saves` amount, using `<Pill>` for applicable/not-applicable
    status), the document checklist (`ChecklistItem[]`, checkbox-style), and the
    state's payment guide (portal link, deadline, numbered steps from
    `GET /api/tax/guide/:stateKey`).
  - Revisiting a document with an existing calculation loads it via
    `GET /api/tax/:documentId/summary` instead of re-showing the intake form.

### 4. Testing / verification

No backend changes, so no new API tests. Manual verification: toggle the theme on
every page and confirm no element stays hardcoded-dark (or hardcoded-light); confirm
the register page now matches login's theme; confirm the tax calculator page's full
flow (intake → calculate → view breakdown/checklist/payment guide) works against the
real API; confirm `npx tsc --noEmit` from `apps/web` stays clean throughout.

## Open questions / risks

- Sequencing against Sub-project 1: deployment (Task 19's Netlify fix, wiring
  `FRONTEND_URL` back on Railway, Task 20's live verification) is still in progress.
  This redesign can proceed in parallel or after — user's call, not decided in this
  spec.
- The Copilot reference's sparkline/line-chart treatment on stat cards is a visual
  flourish beyond what the current dashboard shows (which has no chart on its stat
  boxes at all, only the analytics page's bar chart) — the implementation plan should
  treat "does every stat card need a sparkline, or only where real time-series data
  supports one" as a decision to make concretely per card, not assumed uniformly.
