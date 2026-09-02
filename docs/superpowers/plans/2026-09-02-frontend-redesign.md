# Statemint Frontend Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `apps/web` with a Copilot Money-inspired visual language (sidebar nav, card grid, colored category pills) in both a dark and light theme, fix two pre-existing inconsistencies (broken register-page theme, dead `StatCard`), and build the Tax Calculator page that's linked from navigation but was never actually implemented.

**Architecture:** Extend the existing CSS-custom-property token system in `globals.css` with light-theme values behind a `data-theme` attribute, add a `ThemeProvider` React context to toggle and persist it, migrate every component from hardcoded inline hex colors to the token variables, then apply the new shared `<StatCard>`/`<Pill>` components across existing and new pages.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4 (used sparingly — most styling is inline `style={{}}` referencing CSS custom properties), `lucide-react` icons, `axios` (via existing `lib/api.ts`), `recharts` (analytics page only, unchanged).

**Spec:** `docs/superpowers/specs/2026-09-02-frontend-redesign-design.md`

## Global Constraints

- No backend/API changes — `apps/api` is untouched by this plan.
- Green accent (`#00D97E`) and the existing category color palette (`#00D97E, #60A5FA, #F59E0B, #F87171, #A78BFA, #34D399, #FB923C, #38BDF8`) stay the same in both themes.
- Theme toggle defaults to `dark`, persisted to `localStorage` under key `statemint_theme`.
- No Tailwind `dark:` utility classes — extend the existing CSS-variable pattern in `globals.css` instead.
- Every task must leave `npx tsc --noEmit` (run from `apps/web`) with no new errors.
- No new automated test infrastructure for `apps/web` in this plan — verification is `tsc` + manual dev-server checks, per the spec's non-goals.

## Correction to the spec during planning

The spec assumed the login page (`AuthContainer`/`LeftPanel`/`RightPanel`) was "already a
considered design, kept as-is." Reading the actual files during planning found this is
wrong: `LeftPanel.tsx` and `RightPanel.tsx` are 6-line placeholder stubs (`<section>Left
Panel</section>`), and `LoginForm.tsx` and `FloatingStat.tsx` are **completely empty
files** (0 bytes) that aren't even imported anywhere. There is currently no working
login form in the UI at all. Tasks 10-11 below build these for real rather than
re-skinning existing work.

---

## Part A — Theming infrastructure

### Task 1: Light-theme CSS variables

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: a `[data-theme="light"]` CSS block overriding the existing `:root` custom
  properties. No new property names — every component that already reads `var(--bg)`,
  `var(--surface)`, etc. picks up the light values automatically once `data-theme` is
  set to `"light"` on `<html>`.

- [ ] **Step 1: Add the light theme override block**

In `apps/web/app/globals.css`, after the existing `:root { ... }` block (which defines
the dark values, lines 3-22) and before the `*, *::before, *::after` rule, add:

```css
[data-theme="light"] {
  --bg:        #F7F8FA;
  --surface:   #FFFFFF;
  --surface-2: #F3F4F6;
  --border:    rgba(0,0,0,0.08);
  --border-2:  rgba(0,0,0,0.14);
  --green:     #00D97E;
  --green-dim: rgba(0,217,126,0.12);
  --green-glow:rgba(0,217,126,0.08);
  --white:     #14171A;
  --gray-1:    rgba(20,23,26,0.85);
  --gray-2:    rgba(20,23,26,0.55);
  --gray-3:    rgba(20,23,26,0.32);
  --red:       #E0393E;
  --red-dim:   rgba(224,57,62,0.10);
  --yellow:    #B7791F;
  --yellow-dim:rgba(183,121,31,0.10);
  --blue:      #2563EB;
  --blue-dim:  rgba(37,99,235,0.10);
}
```

- [ ] **Step 2: Make `color-scheme` respond to the theme**

Change:

```css
html { color-scheme: dark; }
```

to:

```css
html { color-scheme: dark; }
html[data-theme="light"] { color-scheme: light; }
```

- [ ] **Step 3: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output (CSS-only change, but confirms nothing else broke).

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): add light theme CSS variable overrides"
```

### Task 2: ThemeProvider and toggle wiring

**Files:**
- Create: `apps/web/lib/theme.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: `ThemeProvider` (component, wraps children), `useTheme(): { theme: 'dark' |
  'light'; toggleTheme: () => void }` — both exported from `apps/web/lib/theme.tsx`.
  Task 5 (Sidebar) imports and calls `useTheme()` to render the toggle button.

- [ ] **Step 1: Create the theme context**

Create `apps/web/lib/theme.tsx`:

```tsx
'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const STORAGE_KEY = 'statemint_theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') setTheme(stored)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
```

- [ ] **Step 2: Wrap the app in the provider**

In `apps/web/app/layout.tsx`, change:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Statemint — AI Bank Statement Analyzer',
  description:
    'Upload your bank statement. Get instant spending insights, tax calculations, and financial clarity.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

to:

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/lib/theme'

export const metadata: Metadata = {
  title: 'Statemint — AI Bank Statement Analyzer',
  description:
    'Upload your bank statement. Get instant spending insights, tax calculations, and financial clarity.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

(The `data-theme="dark"` on `<html>` matches the provider's default state, so there's
no flash-of-unstyled-content for the common case; only users who previously chose light
mode see a brief dark→light flash on load, which is an acceptable tradeoff over adding
SSR cookie plumbing for this app's size.)

- [ ] **Step 3: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/lib/theme.tsx apps/web/app/layout.tsx
git commit -m "feat(web): add ThemeProvider for dark/light toggle"
```

---

## Part B — Shared components

### Task 3: Rewrite `StatCard` (token-based, replaces dead component)

**Files:**
- Modify: `apps/web/components/ui/StatCard.tsx`

**Interfaces:**
- Produces: `StatCard({ label, value, sub?, positive?, negative?, centered? }):
  JSX.Element`, default export. `centered` renders the big-number-first layout used by
  the dashboard's 3 summary stats; omitting it renders the label-first layout used by
  the analytics page's stats. Task 8 and Task 9 both import this component.

- [ ] **Step 1: Replace the file**

Replace the full contents of `apps/web/components/ui/StatCard.tsx` with:

```tsx
interface StatCardProps {
  label: string
  value: string
  sub?: string
  positive?: boolean
  negative?: boolean
  centered?: boolean
}

export default function StatCard({
  label,
  value,
  sub,
  positive,
  negative,
  centered,
}: StatCardProps) {
  const valueColor = positive ? 'var(--green)' : negative ? 'var(--red)' : 'var(--white)'

  if (centered) {
    return (
      <div className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 32, fontWeight: 800, color: valueColor, letterSpacing: '-0.03em' }}>
          {value}
        </p>
        <p style={{ fontSize: 11, color: 'var(--gray-3)', marginTop: 4, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ color: 'var(--gray-2)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ color: valueColor, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
        {value}
      </p>
      {sub && <p style={{ color: 'var(--gray-3)', fontSize: 12, marginTop: 4 }}>{sub}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output (Tasks 8/9 wire this in later; this task just replaces the
component in isolation).

```bash
git add apps/web/components/ui/StatCard.tsx
git commit -m "fix(web): rewrite StatCard on the token system, add centered variant

Was dead code styled in a light-Tailwind convention inconsistent with
the rest of the app, and unused by either page that needed a stat
card (both defined their own inline duplicates instead)."
```

### Task 4: Create `Pill` component

**Files:**
- Create: `apps/web/components/ui/Pill.tsx`

**Interfaces:**
- Produces: `Pill({ children, color?, icon? }): JSX.Element`, default export. `color`
  is a 6-digit hex string (e.g. `'#00D97E'`); when provided, the pill's text is that
  color and its background is that color at ~12% opacity. When omitted, it renders a
  neutral gray pill using the token system. Tasks 5, 8, 9, and 15 use this.

- [ ] **Step 1: Create the component**

Create `apps/web/components/ui/Pill.tsx`:

```tsx
import { ReactNode } from 'react'

interface PillProps {
  children: ReactNode
  color?: string
  icon?: ReactNode
}

export default function Pill({ children, color, icon }: PillProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: color || 'var(--gray-2)',
        background: color ? `${color}1F` : 'var(--surface-2)',
      }}
    >
      {icon}
      {children}
    </span>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/components/ui/Pill.tsx
git commit -m "feat(web): add shared Pill component for colored category/status badges"
```

---

## Part C — Migrate existing components to tokens

### Task 5: Migrate `Sidebar.tsx`, add theme toggle button

**Files:**
- Modify: `apps/web/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `@/lib/theme` (Task 2).
- Produces: no change to `SidebarProps` — same `{ open?, onClose? }` interface Task 6's
  `AppShell` already uses.

- [ ] **Step 1: Add the theme hook and toggle icons to the imports**

Change:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BarChart2, Calculator, LogOut, X } from 'lucide-react'
import { logout } from '@/lib/auth'
```

to:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BarChart2, Calculator, LogOut, X, Sun, Moon } from 'lucide-react'
import { logout } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
```

- [ ] **Step 2: Read the theme state**

Change:

```tsx
export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
```

to:

```tsx
export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
```

- [ ] **Step 3: Replace all hardcoded colors with token variables**

Throughout the file, replace every hardcoded color value with its token equivalent:

```diff
     <div
       style={{
-        background: '#0D0D14',
-        borderRight: '1px solid rgba(255,255,255,0.07)',
+        background: 'var(--surface-2)',
+        borderRight: '1px solid var(--border)',
         height: '100%',
         display: 'flex',
         flexDirection: 'column',
       }}
     >
       {/* Logo */}
-      <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
+      <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid var(--border)' }}>
         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
             <div style={{
               width: 36, height: 36,
               background: 'linear-gradient(135deg, #00D97E, #00A85E)',
               borderRadius: 10,
               display: 'flex', alignItems: 'center', justifyContent: 'center',
               boxShadow: '0 0 16px rgba(0,217,126,0.35)',
             }}>
               <span style={{ color: '#0A0A0F', fontWeight: 800, fontSize: 16 }}>S</span>
             </div>
             <div>
-              <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>Statemint</p>
-              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3 }}>Financial clarity</p>
+              <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>Statemint</p>
+              <p style={{ color: 'var(--gray-3)', fontSize: 11, marginTop: 3 }}>Financial clarity</p>
             </div>
           </div>
           {onClose && (
-            <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }} className="lg:hidden">
+            <button onClick={onClose} style={{ color: 'var(--gray-2)', background: 'none', border: 'none', cursor: 'pointer' }} className="lg:hidden">
               <X size={18} />
             </button>
           )}
         </div>
       </div>
```

```diff
             style={{
               display: 'flex',
               alignItems: 'center',
               gap: 10,
               padding: '10px 14px',
               borderRadius: 10,
               fontSize: 14,
               fontWeight: active ? 600 : 400,
-              color: active ? '#00D97E' : 'rgba(255,255,255,0.5)',
+              color: active ? 'var(--green)' : 'var(--gray-2)',
               background: active ? 'rgba(0,217,126,0.10)' : 'transparent',
               border: active ? '1px solid rgba(0,217,126,0.15)' : '1px solid transparent',
               textDecoration: 'none',
               transition: 'all 0.15s',
             }}
```

(The `background`/`border` for the active nav item stay as green-tinted `rgba` literals
— they're intentionally brand-green in both themes, not part of the bg/surface token
set, so no change needed there or on the active-dot's `background: '#00D97E'` /
`boxShadow`.)

- [ ] **Step 4: Add the theme toggle button above "Sign out"**

Change the footer block:

```tsx
      {/* Footer */}
      <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 14,
            color: 'rgba(255,255,255,0.4)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            transition: 'all 0.15s',
          }}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
```

to:

```tsx
      {/* Footer */}
      <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 14,
            color: 'var(--gray-2)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            transition: 'all 0.15s',
          }}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 14,
            color: 'var(--gray-2)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            transition: 'all 0.15s',
          }}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
```

- [ ] **Step 5: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/components/layout/Sidebar.tsx
git commit -m "feat(web): migrate Sidebar to theme tokens, add dark/light toggle button"
```

### Task 6: Migrate `AppShell.tsx`

**Files:**
- Modify: `apps/web/components/layout/AppShell.tsx`

- [ ] **Step 1: Replace hardcoded colors with tokens**

```diff
   return (
-    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0F' }}>
+    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
       <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
         {/* Mobile topbar */}
         <header
           className="lg:hidden"
           style={{
             display: 'flex',
             alignItems: 'center',
             gap: 12,
             padding: '12px 16px',
-            background: '#0D0D14',
-            borderBottom: '1px solid rgba(255,255,255,0.07)',
+            background: 'var(--surface-2)',
+            borderBottom: '1px solid var(--border)',
             position: 'sticky',
             top: 0,
             zIndex: 30,
           }}
         >
           <button
             onClick={() => setSidebarOpen(true)}
-            style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)' }}
+            style={{ padding: 8, borderRadius: 8, background: 'var(--surface)', border: 'none', cursor: 'pointer', color: 'var(--gray-1)' }}
           >
             <Menu size={18} />
           </button>
           <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
             <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #00D97E, #00A85E)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <span style={{ color: '#0A0A0F', fontWeight: 800, fontSize: 13 }}>S</span>
             </div>
-            <span style={{ color: '#fff', fontWeight: 700 }}>Statemint</span>
+            <span style={{ color: 'var(--white)', fontWeight: 700 }}>Statemint</span>
           </div>
         </header>
```

- [ ] **Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/components/layout/AppShell.tsx
git commit -m "feat(web): migrate AppShell to theme tokens"
```

### Task 7: Migrate `UploadZone.tsx`

**Files:**
- Modify: `apps/web/components/ui/UploadZone.tsx`

- [ ] **Step 1: Replace hardcoded colors with tokens**

```diff
       style={{
-        border: `2px dashed ${dragging ? '#00D97E' : 'rgba(255,255,255,0.12)'}`,
+        border: `2px dashed ${dragging ? 'var(--green)' : 'var(--border-2)'}`,
         borderRadius: 14,
         padding: '36px 24px',
         textAlign: 'center',
         cursor: uploading ? 'default' : 'pointer',
-        background: dragging ? 'rgba(0,217,126,0.05)' : 'rgba(255,255,255,0.02)',
+        background: dragging ? 'var(--green-glow)' : 'var(--surface-2)',
         transition: 'all 0.2s',
       }}
     >
       <input ref={inputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />

       {uploading ? (
         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
-          <Loader2 size={28} style={{ color: '#00D97E' }} className="animate-spin" />
-          <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontSize: 14 }}>Uploading and processing...</p>
+          <Loader2 size={28} style={{ color: 'var(--green)' }} className="animate-spin" />
+          <p style={{ color: 'var(--gray-1)', fontWeight: 500, fontSize: 14 }}>Uploading and processing...</p>
         </div>
       ) : (
         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
           <div style={{
             width: 52, height: 52,
-            background: 'rgba(0,217,126,0.10)',
+            background: 'var(--green-dim)',
             border: '1px solid rgba(0,217,126,0.20)',
             borderRadius: 14,
             display: 'flex', alignItems: 'center', justifyContent: 'center',
           }}>
-            <Upload size={22} style={{ color: '#00D97E' }} />
+            <Upload size={22} style={{ color: 'var(--green)' }} />
           </div>
           <div>
-            <p style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Drop your bank statement here</p>
-            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>or click to browse — PDF files only</p>
+            <p style={{ color: 'var(--white)', fontWeight: 600, fontSize: 15 }}>Drop your bank statement here</p>
+            <p style={{ color: 'var(--gray-2)', fontSize: 13, marginTop: 4 }}>or click to browse — PDF files only</p>
           </div>
         </div>
       )}

       {error && (
-        <p style={{ color: '#FF4D4D', fontSize: 13, marginTop: 12 }}>{error}</p>
+        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>
       )}
```

- [ ] **Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/components/ui/UploadZone.tsx
git commit -m "feat(web): migrate UploadZone to theme tokens"
```

### Task 8: Migrate `app/dashboard/page.tsx` to tokens + shared `StatCard`/`Pill`

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `StatCard` (Task 3, `centered` variant), `Pill` (Task 4).

- [ ] **Step 1: Import the shared components**

Change:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, TrendingUp, Calculator, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import UploadZone from '@/components/ui/UploadZone'
import { Document } from '@/types'
import { formatDate, getStatusLabel } from '@/lib/utils'
import api from '@/lib/api'
```

to:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, TrendingUp, Calculator, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import UploadZone from '@/components/ui/UploadZone'
import StatCard from '@/components/ui/StatCard'
import Pill from '@/components/ui/Pill'
import { Document } from '@/types'
import { formatDate, getStatusLabel } from '@/lib/utils'
import api from '@/lib/api'
```

- [ ] **Step 2: Replace `StatusBadge` with `Pill`**

Change:

```tsx
function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    COMPLETED: 'badge badge-green',
    FAILED: 'badge badge-red',
    PENDING: 'badge badge-yellow',
    PARSING: 'badge badge-blue',
    CATEGORIZING: 'badge badge-blue',
    EMBEDDING: 'badge badge-blue',
  }
  return <span className={cls[status] || 'badge badge-blue'}>{getStatusLabel(status)}</span>
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'COMPLETED') return <CheckCircle size={15} style={{ color: '#00D97E', flexShrink: 0 }} />
  if (status === 'FAILED') return <XCircle size={15} style={{ color: '#FF4D4D', flexShrink: 0 }} />
  return <Loader2 size={15} style={{ color: '#60A5FA', flexShrink: 0 }} className="animate-spin" />
}
```

to:

```tsx
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#00D97E',
  FAILED: '#FF4D4D',
  PENDING: '#F59E0B',
  PARSING: '#60A5FA',
  CATEGORIZING: '#60A5FA',
  EMBEDDING: '#60A5FA',
}

function StatusBadge({ status }: { status: string }) {
  return <Pill color={STATUS_COLORS[status] || '#60A5FA'}>{getStatusLabel(status)}</Pill>
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'COMPLETED') return <CheckCircle size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />
  if (status === 'FAILED') return <XCircle size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
  return <Loader2 size={15} style={{ color: 'var(--blue)', flexShrink: 0 }} className="animate-spin" />
}
```

- [ ] **Step 3: Replace the header and inline stat grid with `StatCard`**

Change:

```tsx
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          Overview
        </p>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Dashboard
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: documents.length, color: '#fff' },
          { label: 'Ready', value: completed, color: '#00D97E' },
          { label: 'Processing', value: processing, color: '#60A5FA' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <p style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: '-0.03em' }}>{value}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</p>
          </div>
        ))}
      </div>
```

to:

```tsx
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: 'var(--gray-3)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          Overview
        </p>
        <h1 style={{ color: 'var(--white)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Dashboard
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total" value={String(documents.length)} centered />
        <StatCard label="Ready" value={String(completed)} positive centered />
        <StatCard label="Processing" value={String(processing)} centered />
      </div>
```

(`Processing` drops the always-blue color it had before — `StatCard` only special-cases
`positive`/`negative`, defaulting to `var(--white)` otherwise, which matches how `Total`
already behaved. This is a deliberate simplification consistent with the shared
component's API, not an oversight.)

- [ ] **Step 4: Replace remaining hardcoded colors in the upload/list/empty sections**

```diff
       {/* Upload */}
       <div className="card" style={{ marginBottom: 24 }}>
-        <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Upload Statement</p>
-        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 16 }}>
+        <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Upload Statement</p>
+        <p style={{ color: 'var(--gray-2)', fontSize: 13, marginBottom: 16 }}>
           GTBank · Kuda · Access · Zenith · UBA · and more
         </p>
         <UploadZone onUploadComplete={handleUploadComplete} />
       </div>

       {/* Documents list */}
       {!loading && documents.length > 0 && (
         <div className="card">
-          <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Statements</p>
+          <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Statements</p>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
             {documents.map((doc) => (
               <div
                 key={doc.id}
                 style={{
                   display: 'flex',
                   alignItems: 'center',
                   gap: 12,
                   padding: '12px 14px',
                   borderRadius: 12,
                   background: 'transparent',
                   transition: 'background 0.15s',
                   cursor: 'default',
                 }}
-                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
+                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                 onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
               >
                 <div style={{
                   width: 38, height: 38,
-                  background: 'rgba(255,255,255,0.06)',
+                  background: 'var(--surface-2)',
                   borderRadius: 10,
                   display: 'flex', alignItems: 'center', justifyContent: 'center',
                   flexShrink: 0,
                 }}>
-                  <FileText size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
+                  <FileText size={16} style={{ color: 'var(--gray-2)' }} />
                 </div>

                 <div style={{ flex: 1, minWidth: 0 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                     <StatusIcon status={doc.status} />
-                    <p style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
+                    <p style={{ color: 'var(--white)', fontWeight: 600, fontSize: 14 }}>
                       {doc.bankName || 'Detecting bank...'}
                     </p>
                     <StatusBadge status={doc.status} />
                   </div>
-                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
+                  <p style={{ color: 'var(--gray-3)', fontSize: 12 }}>
                     {doc.fileName} ·{' '}
                     {doc.transactionCount ? `${doc.transactionCount} transactions` : 'Processing...'}{' '}
                     · {formatDate(doc.createdAt)}
                   </p>
                 </div>
```

```diff
       {/* Empty state */}
       {!loading && documents.length === 0 && (
         <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
           <div style={{
             width: 56, height: 56,
-            background: 'rgba(0,217,126,0.10)',
+            background: 'var(--green-dim)',
             border: '1px solid rgba(0,217,126,0.20)',
             borderRadius: 16,
             display: 'flex', alignItems: 'center', justifyContent: 'center',
             margin: '0 auto 16px',
           }}>
-            <FileText size={24} style={{ color: '#00D97E' }} />
+            <FileText size={24} style={{ color: 'var(--green)' }} />
           </div>
-          <p style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>No statements yet</p>
-          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 6, maxWidth: 280, margin: '6px auto 0' }}>
+          <p style={{ color: 'var(--white)', fontWeight: 600, fontSize: 16 }}>No statements yet</p>
+          <p style={{ color: 'var(--gray-2)', fontSize: 13, marginTop: 6, maxWidth: 280, margin: '6px auto 0' }}>
             Upload your first bank statement to see spending insights and tax calculations
           </p>
         </div>
       )}
```

- [ ] **Step 5: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/app/dashboard/page.tsx
git commit -m "feat(web): migrate dashboard to theme tokens and shared StatCard/Pill"
```

### Task 9: Migrate `app/analytics/[id]/page.tsx` to tokens + shared `StatCard`/`Pill`

**Files:**
- Modify: `apps/web/app/analytics/[id]/page.tsx`

**Interfaces:**
- Consumes: `StatCard` (Task 3, non-centered variant — replaces the page's local
  `StatBox` function), `Pill` (Task 4).

- [ ] **Step 1: Import the shared components, remove the local `StatBox`**

Change:

```tsx
import AppShell from '@/components/layout/AppShell'
import { Analytics, ChatMessage } from '@/types'
import { formatCurrency } from '@/lib/utils'
import api from '@/lib/api'

const CATEGORY_COLORS = [
  '#00D97E', '#60A5FA', '#F59E0B', '#F87171',
  '#A78BFA', '#34D399', '#FB923C', '#38BDF8',
]

function StatBox({
  label, value, sub, positive, negative
}: {
  label: string
  value: string
  sub?: string
  positive?: boolean
  negative?: boolean
}) {
  const color = positive ? '#00D97E' : negative ? '#FF4D4D' : '#fff'
  return (
    <div className="card" style={{ padding: '20px' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ color, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 4 }}>{sub}</p>}
    </div>
  )
}
```

to:

```tsx
import AppShell from '@/components/layout/AppShell'
import StatCard from '@/components/ui/StatCard'
import { Analytics, ChatMessage } from '@/types'
import { formatCurrency } from '@/lib/utils'
import api from '@/lib/api'

const CATEGORY_COLORS = [
  '#00D97E', '#60A5FA', '#F59E0B', '#F87171',
  '#A78BFA', '#34D399', '#FB923C', '#38BDF8',
]
```

- [ ] **Step 2: Use `StatCard` in place of `StatBox`, and tokenize the rest**

Change:

```tsx
      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatBox label="Money In" value={formatCurrency(analytics.totalCredits)} positive sub={`${analytics.transactionCount} transactions`} />
        <StatBox label="Money Out" value={formatCurrency(analytics.totalDebits)} negative />
        <StatBox
          label="Net Flow"
          value={formatCurrency(Math.abs(analytics.netFlow))}
          positive={netPositive}
          negative={!netPositive}
          sub={netPositive ? 'You saved money' : 'You spent more than you earned'}
        />
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          {netPositive
            ? <TrendingUp size={28} style={{ color: '#00D97E' }} />
            : <TrendingDown size={28} style={{ color: '#FF4D4D' }} />
          }
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center' }}>
            {netPositive ? 'Positive cash flow' : 'Negative cash flow'}
          </p>
        </div>
      </div>
```

to:

```tsx
      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="Money In" value={formatCurrency(analytics.totalCredits)} positive sub={`${analytics.transactionCount} transactions`} />
        <StatCard label="Money Out" value={formatCurrency(analytics.totalDebits)} negative />
        <StatCard
          label="Net Flow"
          value={formatCurrency(Math.abs(analytics.netFlow))}
          positive={netPositive}
          negative={!netPositive}
          sub={netPositive ? 'You saved money' : 'You spent more than you earned'}
        />
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          {netPositive
            ? <TrendingUp size={28} style={{ color: 'var(--green)' }} />
            : <TrendingDown size={28} style={{ color: 'var(--red)' }} />
          }
          <p style={{ color: 'var(--gray-2)', fontSize: 12, textAlign: 'center' }}>
            {netPositive ? 'Positive cash flow' : 'Negative cash flow'}
          </p>
        </div>
      </div>
```

- [ ] **Step 3: Tokenize the remaining hardcoded colors**

Apply the same `'#fff'` → `'var(--white)'`, `'rgba(255,255,255,0.4)'` →
`'var(--gray-2)'`, `'rgba(255,255,255,0.3)'` / `'rgba(255,255,255,0.35)'` →
`'var(--gray-3)'`, `'#00D97E'` → `'var(--green)'`, `'#FF4D4D'` → `'var(--red)'`
substitutions used in Tasks 6-8 throughout the rest of this file: the header block, the
`CustomTooltip` component, the monthly-flow chart section, the spending-by-category
section, the top-merchants section, and the chat widget (message bubbles, suggested
questions, input). Do not change the `CATEGORY_COLORS` array itself, the recharts
`fill`/`stroke` props tied to specific hex values for `totalCredits`/`totalDebits` bars
(those stay `'#00D97E'`/`'#FF4D4D'` literally, since recharts renders to an SVG canvas
independent of CSS custom properties and needs a literal color value), or the
per-category dot colors sourced from `CATEGORY_COLORS[i % CATEGORY_COLORS.length]`.

- [ ] **Step 4: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

Run the dev server and visually confirm the analytics page still renders (chart, category
list, chat) — since Step 3 is a broad find-and-replace across one large file, a visual
check here matters more than usual: `npm run dev`, navigate to an analytics page for any
completed document, confirm nothing looks broken, then stop the dev server.

```bash
git add apps/web/app/analytics/[id]/page.tsx
git commit -m "feat(web): migrate analytics page to theme tokens and shared StatCard"
```

---

## Part D — Auth pages (real build, not re-skin)

### Task 10: Build `LeftPanel` and `FloatingStat`

**Files:**
- Modify: `apps/web/app/auth/login/components/LeftPanel.tsx` (currently a 6-line stub)
- Modify: `apps/web/app/auth/login/components/FloatingStat.tsx` (currently empty)

**Interfaces:**
- Produces: `FloatingStat({ icon, label, style? }): JSX.Element`, default export, used
  only by `LeftPanel` in this task.

- [ ] **Step 1: Build `FloatingStat`**

Replace the (empty) contents of `apps/web/app/auth/login/components/FloatingStat.tsx`
with:

```tsx
import { ReactNode, CSSProperties } from 'react'

interface FloatingStatProps {
  icon: ReactNode
  label: string
  style?: CSSProperties
}

export default function FloatingStat({ icon, label, style }: FloatingStatProps) {
  return (
    <div
      style={{
        position: 'absolute',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(12px)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        ...style,
      }}
    >
      {icon}
      {label}
    </div>
  )
}
```

- [ ] **Step 2: Build `LeftPanel`**

Replace the full contents of `apps/web/app/auth/login/components/LeftPanel.tsx` with:

```tsx
import { ShieldCheck, TrendingUp, Landmark } from 'lucide-react'
import FloatingStat from './FloatingStat'

export default function LeftPanel() {
  return (
    <section
      className="relative hidden lg:flex flex-col justify-center overflow-hidden px-12 py-16"
      style={{
        background: 'radial-gradient(120% 120% at 0% 0%, #0F2E22 0%, #0A0A0F 60%)',
      }}
    >
      <FloatingStat icon={<Landmark size={14} />} label="18 Nigerian banks supported" style={{ top: '12%', left: '8%' }} />
      <FloatingStat icon={<TrendingUp size={14} />} label="Instant spending insights" style={{ top: '38%', right: '6%' }} />
      <FloatingStat icon={<ShieldCheck size={14} />} label="Bank-grade encryption" style={{ bottom: '16%', left: '14%' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
        <div
          style={{
            width: 44,
            height: 44,
            background: 'linear-gradient(135deg, #00D97E, #00A85E)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
            boxShadow: '0 0 20px rgba(0,217,126,0.35)',
          }}
        >
          <span style={{ color: '#0A0A0F', fontWeight: 800, fontSize: 19 }}>S</span>
        </div>
        <h1 style={{ color: '#fff', fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 16 }}>
          Your money, beautifully organized.
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.6 }}>
          Upload a bank statement and get instant categorized spending, tax estimates,
          and answers to any question about your money.
        </p>
      </div>
    </section>
  )
}
```

(This panel is intentionally always dark, regardless of the app-wide theme — it's a
fixed brand/marketing surface, matching how Copilot's own reference material treats its
hero panels. Its colors are literal, not tokens, on purpose.)

- [ ] **Step 3: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/app/auth/login/components/FloatingStat.tsx apps/web/app/auth/login/components/LeftPanel.tsx
git commit -m "feat(web): build LeftPanel and FloatingStat (were empty/stub files)

LeftPanel was a 6-line placeholder and FloatingStat was a completely
empty, unimported file. Building both for real as part of this
redesign, not re-skinning existing work as the spec assumed before
these files were actually read."
```

### Task 11: Build `LoginForm`, wire into `RightPanel`, tokenize `AuthContainer`

**Files:**
- Modify: `apps/web/app/auth/login/components/LoginForm.tsx` (currently empty)
- Modify: `apps/web/app/auth/login/components/RightPanel.tsx` (currently a 6-line stub)
- Modify: `apps/web/app/auth/login/components/AuthContainer.tsx`

**Interfaces:**
- Consumes: `login(email, password): Promise<string>` from `apps/web/lib/auth.ts`
  (already exists, unchanged).

- [ ] **Step 1: Build `LoginForm`**

Replace the (empty) contents of
`apps/web/app/auth/login/components/LoginForm.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { login } from '@/lib/auth'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.push('/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid email or password'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 6 }}>
          Welcome back
        </h2>
        <p style={{ color: 'var(--gray-2)', fontSize: 14 }}>Sign in to continue to Statemint</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Email address</label>
          <input
            type="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div style={{ background: 'var(--red-dim)', color: 'var(--red)', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 20px' }} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Sign in'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--gray-2)', marginTop: 24 }}>
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" style={{ color: 'var(--green)', fontWeight: 600 }}>
          Create one
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Wire `LoginForm` into `RightPanel`**

Replace the full contents of `apps/web/app/auth/login/components/RightPanel.tsx` with:

```tsx
import LoginForm from './LoginForm'

export default function RightPanel() {
  return (
    <section
      className="flex items-center justify-center px-8 py-16"
      style={{ background: 'var(--surface)' }}
    >
      <LoginForm />
    </section>
  )
}
```

- [ ] **Step 3: Tokenize `AuthContainer`'s background/border colors**

Change:

```tsx
'use client'

import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";

export default function AuthContainer() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0F]">

      {/* Background Glow */}
      <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-emerald-500/20 blur-[180px]" />
      <div className="absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-emerald-400/10 blur-[200px]" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-10">

        <div
          className="
          grid
          w-full
          max-w-7xl
          overflow-hidden
          rounded-[32px]
          border
          border-white/10
          bg-[#111116]
          shadow-[0_40px_120px_rgba(0,0,0,.55)]
          lg:grid-cols-[1fr_520px]
          "
        >
          <LeftPanel />
          <RightPanel />
        </div>

      </div>
    </main>
  );
}
```

to:

```tsx
'use client'

import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";

export default function AuthContainer() {
  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Background Glow */}
      <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-emerald-500/20 blur-[180px]" />
      <div className="absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-emerald-400/10 blur-[200px]" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-10">

        <div
          className="grid w-full max-w-7xl overflow-hidden rounded-[32px] lg:grid-cols-[1fr_520px]"
          style={{
            border: '1px solid var(--border-2)',
            background: 'var(--surface)',
            boxShadow: '0 40px 120px rgba(0,0,0,.35)',
          }}
        >
          <LeftPanel />
          <RightPanel />
        </div>

      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

Run the dev server, visit `/auth/login`, confirm a real two-panel login form now
renders (branding panel with floating stat pills on the left, a working email/password
form on the right) instead of the previous "Left Panel" / "Right Panel" placeholder
text. Stop the dev server.

```bash
git add apps/web/app/auth/login/components/LoginForm.tsx apps/web/app/auth/login/components/RightPanel.tsx apps/web/app/auth/login/components/AuthContainer.tsx
git commit -m "feat(web): build LoginForm (was an empty file), wire into RightPanel

Completes the login page — previously there was no working login form
in the UI at all; LoginForm.tsx was empty and unimported, and
RightPanel.tsx was a placeholder stub."
```

### Task 12: Rewrite `app/auth/register/page.tsx` to match the app's actual theme

**Files:**
- Modify: `apps/web/app/auth/register/page.tsx`

- [ ] **Step 1: Replace the full file**

Replace the full contents of `apps/web/app/auth/register/page.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { register } from '@/lib/auth'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await register(email, password, name)
      router.push('/dashboard')
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Registration failed'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: 'linear-gradient(135deg, #00D97E, #00A85E)',
              borderRadius: 12,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <span style={{ color: '#0A0A0F', fontWeight: 800, fontSize: 20 }}>S</span>
          </div>
          <h1 style={{ color: 'var(--white)', fontSize: 24, fontWeight: 800 }}>Statemint</h1>
          <p style={{ color: 'var(--gray-2)', fontSize: 14, marginTop: 4 }}>Create your account</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Full name</label>
              <input
                type="text"
                className="input"
                placeholder="Leke Oyeleke"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && (
              <div style={{ background: 'var(--red-dim)', color: 'var(--red)', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 20px' }} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Create account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--gray-2)', marginTop: 16 }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ color: 'var(--green)', fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

Run the dev server, visit `/auth/register`, confirm it now matches the login page's
dark theme (was previously plain light Tailwind — `bg-gray-50`, `text-gray-900`) and
still submits correctly. Stop the dev server.

```bash
git add apps/web/app/auth/register/page.tsx
git commit -m "fix(web): rewrite register page to match the app's actual theme

Was styled in plain light-mode Tailwind (bg-gray-50, text-gray-900)
while every other page (login, dashboard, analytics) was dark-themed
-- registering looked like a different, broken app."
```

---

## Part E — Tax Calculator (new)

### Task 13: Build `TaxIntakeForm`

**Files:**
- Create: `apps/web/components/tax/TaxIntakeForm.tsx`

**Interfaces:**
- Consumes: `TaxDetection`, `TaxCalculation`, `NigerianState` from `@/types` (already
  defined, unchanged — see `apps/web/types/index.ts`); `api` from `@/lib/api`.
- Produces: `TaxIntakeForm({ documentId, detection, onCalculated }): JSX.Element`,
  default export, where `documentId: string`, `detection: TaxDetection | null`,
  `onCalculated: (result: TaxCalculation) => void`. Task 16 renders this.

- [ ] **Step 1: Create the component**

Create `apps/web/components/tax/TaxIntakeForm.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { TaxCalculation, TaxDetection, NigerianState } from '@/types'

interface TaxIntakeFormProps {
  documentId: string
  detection: TaxDetection | null
  onCalculated: (result: TaxCalculation) => void
}

type UserType = 'PAYE' | 'SELF_EMPLOYED' | 'BUSINESS'

export default function TaxIntakeForm({ documentId, detection, onCalculated }: TaxIntakeFormProps) {
  const [states, setStates] = useState<NigerianState[]>([])
  const [userType, setUserType] = useState<UserType>(detection?.suggestedType || 'PAYE')
  const [stateOfResidence, setStateOfResidence] = useState('lagos')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [lifeInsurance, setLifeInsurance] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/tax/states').then((res) => setStates(res.data.data || []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post(`/tax/${documentId}/calculate`, {
        userType,
        stateOfResidence,
        ...(monthlyRent && { monthlyRent: Number(monthlyRent) }),
        ...(lifeInsurance && { lifeInsurance: Number(lifeInsurance) }),
      })
      onCalculated(res.data.data)
    } catch {
      setError('Could not calculate tax. Please check your inputs and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        Tell us about your income
      </p>
      <p style={{ color: 'var(--gray-2)', fontSize: 13, marginBottom: 20 }}>
        {detection
          ? `We detected ${detection.confidence.toLowerCase()}-confidence ${detection.suggestedType.replace('_', ' ').toLowerCase()} income from your statement.`
          : 'This helps us calculate accurate deductions and find your state tax portal.'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Income type</label>
          <select className="input" value={userType} onChange={(e) => setUserType(e.target.value as UserType)}>
            <option value="PAYE">PAYE (Employed)</option>
            <option value="SELF_EMPLOYED">Self-employed</option>
            <option value="BUSINESS">Business owner</option>
          </select>
        </div>

        <div>
          <label className="label">State of residence</label>
          <select className="input" value={stateOfResidence} onChange={(e) => setStateOfResidence(e.target.value)}>
            {states.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Monthly rent (optional)</label>
          <input
            type="number"
            className="input"
            placeholder="e.g. 250000"
            value={monthlyRent}
            onChange={(e) => setMonthlyRent(e.target.value)}
            min={0}
          />
        </div>

        <div>
          <label className="label">Annual life insurance premium (optional)</label>
          <input
            type="number"
            className="input"
            placeholder="e.g. 50000"
            value={lifeInsurance}
            onChange={(e) => setLifeInsurance(e.target.value)}
            min={0}
          />
        </div>

        {error && (
          <div style={{ background: 'var(--red-dim)', color: 'var(--red)', fontSize: 13, padding: '10px 12px', borderRadius: 10 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={loading || states.length === 0}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Calculate my tax'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output (Task 16 wires this in; this task only needs to compile in
isolation, which `tsc` checks project-wide regardless).

```bash
git add apps/web/components/tax/TaxIntakeForm.tsx
git commit -m "feat(web): build TaxIntakeForm for the new tax calculator page"
```

### Task 14: Build `TaxResults`

**Files:**
- Create: `apps/web/components/tax/TaxResults.tsx`

**Interfaces:**
- Consumes: `Pill` (Task 4), `TaxCalculation` from `@/types`, `formatCurrency` from
  `@/lib/utils`.
- Produces: `TaxResults({ result }): JSX.Element`, default export, where `result:
  TaxCalculation`. Task 16 renders this.

- [ ] **Step 1: Create the component**

Create `apps/web/components/tax/TaxResults.tsx`:

```tsx
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import Pill from '@/components/ui/Pill'
import { TaxCalculation } from '@/types'
import { formatCurrency } from '@/lib/utils'

export default function TaxResults({ result }: { result: TaxCalculation }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div>
          <p style={{ color: 'var(--gray-2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Gross income
          </p>
          <p style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800 }}>{formatCurrency(result.grossIncome)}</p>
        </div>
        <div>
          <p style={{ color: 'var(--gray-2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Total tax (annual)
          </p>
          <p style={{ color: result.isTaxFree ? 'var(--green)' : 'var(--white)', fontSize: 22, fontWeight: 800 }}>
            {formatCurrency(result.totalTax)}
          </p>
        </div>
        <div>
          <p style={{ color: 'var(--gray-2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Effective rate
          </p>
          <p style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800 }}>{result.effectiveRate.toFixed(1)}%</p>
        </div>
      </div>

      {result.isTaxFree && (
        <div className="card-glow" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={18} style={{ color: 'var(--green)' }} />
          <p style={{ color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>
            Your income is tax-free under the ₦800,000 threshold.
          </p>
        </div>
      )}

      {/* Band breakdown */}
      {result.breakdown.length > 0 && (
        <div className="card">
          <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Tax band breakdown</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.breakdown.map((band) => (
              <div key={band.band} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div>
                  <p style={{ color: 'var(--gray-1)' }}>{band.band}</p>
                  <p style={{ color: 'var(--gray-3)', fontSize: 11 }}>{band.rate}% rate</p>
                </div>
                <p style={{ color: 'var(--white)', fontWeight: 700 }}>{formatCurrency(band.taxDue)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deductions */}
      <div className="card">
        <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Deductions</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result.deductions.map((d) => (
            <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ color: d.applicable ? 'var(--gray-1)' : 'var(--gray-3)', fontSize: 13, fontWeight: 500 }}>
                  {d.name}
                </p>
                <p style={{ color: 'var(--gray-3)', fontSize: 11, marginTop: 2 }}>{d.description}</p>
              </div>
              {d.applicable ? (
                <Pill color="#00D97E">Saves {formatCurrency(d.saves)}</Pill>
              ) : (
                <Pill>Not applied</Pill>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className="card">
        <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Filing checklist</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {result.checklist.map((item) => (
            <div key={item.item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {item.completed ? (
                <CheckCircle2 size={16} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }} />
              ) : (
                <Circle size={16} style={{ color: 'var(--gray-3)', flexShrink: 0, marginTop: 1 }} />
              )}
              <div>
                <p style={{ color: 'var(--gray-1)', fontSize: 13, fontWeight: 500 }}>{item.item}</p>
                <p style={{ color: 'var(--gray-3)', fontSize: 11, marginTop: 2 }}>{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment guide */}
      <div className="card">
        <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          {result.paymentGuide.irsName}
        </p>
        <p style={{ color: 'var(--gray-2)', fontSize: 12, marginBottom: 16 }}>
          Deadline: {result.paymentGuide.deadline}
        </p>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, marginBottom: 16 }}>
          {result.paymentGuide.steps.map((step, i) => (
            <li key={i} style={{ color: 'var(--gray-1)', fontSize: 13, lineHeight: 1.5 }}>{step}</li>
          ))}
        </ol>
        <a
          href={result.paymentGuide.portal}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
          style={{ textDecoration: 'none', display: 'inline-flex' }}
        >
          Visit {result.paymentGuide.stateName} portal <ExternalLink size={14} />
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/components/tax/TaxResults.tsx
git commit -m "feat(web): build TaxResults for the new tax calculator page"
```

### Task 15: Add `/tax/:documentId` page assembling intake + results

**Files:**
- Create: `apps/web/app/tax/[id]/page.tsx`

**Interfaces:**
- Consumes: `TaxIntakeForm` (Task 13), `TaxResults` (Task 14), `AppShell` (existing,
  Task 6), `TaxCalculation`/`TaxDetection` from `@/types`, `api` from `@/lib/api`.

**Context:** `Sidebar.tsx` already links to `/tax` (a general nav entry — not wired to
a specific document; clicking it with no document context isn't handled by this task,
since every existing entry point (`dashboard/page.tsx`'s "Tax" button) navigates to
`/tax/:id` for a specific document). This task only builds the `/tax/[id]` dynamic
route, matching what's actually linked to today.

- [ ] **Step 1: Create the page**

Create `apps/web/app/tax/[id]/page.tsx`:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TaxIntakeForm from '@/components/tax/TaxIntakeForm'
import TaxResults from '@/components/tax/TaxResults'
import { TaxCalculation, TaxDetection } from '@/types'
import api from '@/lib/api'

export default function TaxPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [result, setResult] = useState<TaxCalculation | null>(null)
  const [detection, setDetection] = useState<TaxDetection | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const summaryRes = await api.get(`/tax/${id}/summary`)
      setResult(summaryRes.data.data)
    } catch {
      try {
        const detectRes = await api.get(`/tax/${id}/detect`)
        setDetection(detectRes.data.data)
      } catch {
        /* proceed with no detection — the form still works without it */
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <AppShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <Loader2 size={32} style={{ color: 'var(--green)' }} className="animate-spin" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost" style={{ padding: '8px 10px' }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <p style={{ color: 'var(--gray-3)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Tax Calculator
          </p>
          <h1 style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {result ? 'Your tax summary' : 'Estimate your tax'}
          </h1>
        </div>
      </div>

      {result ? (
        <TaxResults result={result} />
      ) : (
        <TaxIntakeForm documentId={id} detection={detection} onCalculated={setResult} />
      )}
    </AppShell>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

Run the dev server, upload/select a completed document, click its "Tax" button from
the dashboard, confirm the intake form loads with the states dropdown populated,
submit it, and confirm the results view renders the breakdown/deductions/checklist/
payment guide against the real API. Revisit the same URL and confirm it now loads
straight into the results view via `/tax/:id/summary`. Stop the dev server.

```bash
git add apps/web/app/tax/[id]/page.tsx
git commit -m "feat(web): add /tax/:id page — was linked from nav but never built

Sidebar and the dashboard's Tax button both linked to this route, but
app/tax/ didn't exist at all. Built against the API's already-complete
tax endpoints (states, detect, calculate, summary, guide)."
```

---

## Part F — Verification

### Task 16: Full theme-toggle sweep and final `tsc` check

**Files:** none — this is a manual verification pass, not a code change.

- [ ] **Step 1: Run the dev server**

Run: `cd apps/web && npm run dev`

- [ ] **Step 2: Sweep every page in both themes**

For each of: `/auth/login`, `/auth/register`, `/dashboard`, `/analytics/:id` (any
completed document), `/tax/:id` (both the intake form and, after calculating, the
results view) — load the page in dark mode (default), then click the sidebar's
theme-toggle button (on pages that have the sidebar — `/auth/login` and
`/auth/register` don't, and are expected to stay dark per Task 10's note about
`LeftPanel` being an intentionally fixed brand surface) and confirm:

- No element stays hardcoded to the wrong theme's color (e.g., dark text on a light
  background, or a card that doesn't change background).
- The green accent and category pill colors look the same in both themes.
- Toggling, then reloading the page, keeps the chosen theme (via `localStorage`).

- [ ] **Step 3: Final compile check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

Run: `cd apps/web && npm run build`
Expected: build succeeds, and the route list includes `/tax/[id]` alongside the
existing routes.

- [ ] **Step 4: Report results**

No commit for this task (verification only). Note any issues found — anything
surfaced here should be triaged as a follow-up fix with its own scope, not silently
patched without updating this plan, since that would leave the written record
inconsistent with what actually shipped.

---

## Self-Review Notes

- **Spec coverage:** Theming architecture → Tasks 1-2. Component migration/cleanup →
  Tasks 3-9. Login/register → Tasks 10-12 (upgraded from "re-skin" to "build," per the
  correction noted after Global Constraints, once the actual empty/stub files were
  read). Tax Calculator → Tasks 13-15. Testing/verification section → Task 16.
- **Type consistency:** `StatCard`'s props (`label, value, sub?, positive?, negative?,
  centered?`) are used identically in Task 8 (dashboard, `centered`) and Task 9
  (analytics, no `centered`). `Pill`'s props (`children, color?, icon?`) match across
  Tasks 5 (not used directly — Sidebar keeps its own active-nav-item styling, not a
  Pill), 8 (`StatusBadge`), and 14 (`TaxResults`' applicable/not-applied badges).
  `TaxIntakeForm`'s `onCalculated: (result: TaxCalculation) => void` matches exactly
  what Task 15's page passes as `onCalculated={setResult}` where `result` is typed
  `TaxCalculation | null`. `TaxDetection`, `TaxCalculation`, `NigerianState` are all
  pre-existing types from `apps/web/types/index.ts` — no new type definitions needed.
- **No placeholders:** every step includes literal, complete code — no "add
  appropriate styling" or "similar to Task N" placeholders. Task 9 Step 3 is the one
  step that describes a repeated substitution pattern rather than showing every single
  line changed (the file is large and the substitutions are mechanical repeats of
  patterns already shown verbatim in Tasks 6-8) — the exact token mappings are given,
  so this is a bounded, unambiguous instruction, not an open-ended "handle the rest."
