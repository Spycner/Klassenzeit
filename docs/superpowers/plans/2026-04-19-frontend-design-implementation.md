# Frontend design implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Klassenzeit design bundle (PK tokens, collapsible sidebar, real dashboard, redesigned CRUD pages, guided empty states, EN/DE copy) onto the existing React + Vite + shadcn frontend, keeping all existing CRUD tests green and adding targeted tests for the new behavior.

**Architecture:**
- Replace the neutral shadcn token set in `frontend/src/styles/app.css` with the PK token set (moss-green primary, warm off-white, Quicksand + Fira Code + Special Elite fonts); `@theme inline` exposes all tokens to Tailwind utilities.
- New `SidebarProvider` context mirrors `ThemeProvider`; drives a collapsible `<AppSidebar/>`. `<AppShell/>` wraps children with the provider and renders the shell.
- `features/dashboard/` composes stat grid + readiness checklist + next steps + quick add + recently-edited placeholder, all driven by live counts from the four existing list queries.
- Each CRUD page gets a shared `<Toolbar/>` (search) and shared `<EmptyState/>` (guided steps). URL search params for search/sort. Week schemes switches to a list + detail split view.

**Tech Stack:** Vite 7, React 19, TanStack Router + Query, shadcn/ui, Tailwind 4, React Hook Form + Zod, react-i18next, next-themes, Vitest + Testing Library + MSW.

---

## File structure (target shape)

```
frontend/src/
  components/
    app-sidebar.tsx              NEW
    empty-state.tsx              NEW
    toolbar.tsx                  NEW
    sidebar-provider.tsx         NEW
    language-switcher.tsx        MODIFY (pill-style switch)
    layout/app-shell.tsx         MODIFY (wire provider + breadcrumbs)
  features/
    dashboard/
      dashboard-page.tsx         NEW
      stat-grid.tsx              NEW
      readiness-checklist.tsx    NEW
      next-steps.tsx             NEW
      quick-add.tsx              NEW
      recently-edited.tsx        NEW
    rooms/rooms-page.tsx         MODIFY (dense table, toolbar, empty state)
    subjects/subjects-page.tsx   MODIFY (dense table, toolbar, empty state)
    teachers/teachers-page.tsx   MODIFY (dense table, toolbar, empty state)
    week-schemes/week-schemes-page.tsx  MODIFY (split view, toolbar, empty state)
  routes/
    _authed.index.tsx            MODIFY (render DashboardPage)
    _authed.rooms.tsx            MODIFY (validateSearch + create deep link)
    _authed.subjects.tsx         MODIFY (validateSearch + create deep link)
    _authed.teachers.tsx         MODIFY (validateSearch + create deep link)
    _authed.week-schemes.tsx     MODIFY (validateSearch + create deep link)
  styles/app.css                 MODIFY (PK tokens, @theme inline, helper classes)
  i18n/locales/{en,de}.json      MODIFY (add dashboard.*, common.*, subtitle/empty.*)
frontend/tests/
  sidebar-provider.test.tsx      NEW
  app-shell.test.tsx             NEW
  empty-state.test.tsx           NEW
  dashboard-page.test.tsx        NEW
  rooms-page.test.tsx            MODIFY (assertions updated for new markup)
  subjects-page.test.tsx         MODIFY (same)
  teachers-page.test.tsx         MODIFY (same)
  week-schemes-page.test.tsx     MODIFY (same)
  msw-handlers.ts                MODIFY (only if new endpoints hit)
```

---

## Task 1: PK design tokens and fonts

**Files:**
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1.1: Replace `:root` and `.dark` blocks in `frontend/src/styles/app.css`**

Open `frontend/src/styles/app.css`. Replace the entire file contents with the block below. (We keep the `@theme inline` mapping expanded with sidebar + chart + radius + font tokens, and add the Google Fonts `@import` plus semantic helper classes used by the new layouts. Everything after `@theme inline` is helper CSS that remains token-driven.)

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Fira+Code:wght@400;500;600&family=Special+Elite&display=swap");

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: oklch(0.9914 0.0098 87.4695);
  --foreground: oklch(0.3296 0.0122 62.2125);
  --card: oklch(0.9688 0.0119 79.7848);
  --card-foreground: oklch(0.3296 0.0122 62.2125);
  --popover: oklch(0.9914 0.0098 87.4695);
  --popover-foreground: oklch(0.3296 0.0122 62.2125);
  --muted: oklch(0.9365 0.0206 81.7807);
  --muted-foreground: oklch(0.5579 0.0208 70.0358);
  --accent: oklch(0.883 0.0596 64.4503);
  --accent-foreground: oklch(0.4168 0.0436 68.8424);

  --primary: oklch(0.5954 0.084 143.4195);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.7063 0.0564 227.2095);
  --secondary-foreground: oklch(1 0 0);
  --destructive: oklch(0.652 0.1363 29.5653);
  --destructive-foreground: oklch(1 0 0);

  --border: oklch(0.907 0.0212 79.0883);
  --input: oklch(0.9483 0.0177 81.3313);
  --ring: oklch(0.5954 0.084 143.4195);

  --chart-1: oklch(0.5954 0.084 143.4195);
  --chart-2: oklch(0.7063 0.0564 227.2095);
  --chart-3: oklch(0.8052 0.1329 78.1498);
  --chart-4: oklch(0.652 0.1363 29.5653);
  --chart-5: oklch(0.6684 0.0684 316.8892);

  --sidebar: oklch(0.9579 0.0153 77.0712);
  --sidebar-foreground: oklch(0.3296 0.0122 62.2125);
  --sidebar-primary: oklch(0.5954 0.084 143.4195);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.9255 0.024 79.7388);
  --sidebar-accent-foreground: oklch(0.3296 0.0122 62.2125);
  --sidebar-border: oklch(0.907 0.0212 79.0883);
  --sidebar-ring: oklch(0.5954 0.084 143.4195);

  --font-sans: "Quicksand", system-ui, sans-serif;
  --font-serif: "Lora", Georgia, serif;
  --font-mono: "Fira Code", monospace;

  --radius: 1rem;
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --tracking-normal: 0.01em;

  --shadow-xs: 0px 4px 12px 0px hsl(27.27 10.48% 20.59% / 0.04);
  --shadow-sm: 0px 4px 12px 0px hsl(27.27 10.48% 20.59% / 0.08), 0px 1px 2px -1px hsl(27.27 10.48% 20.59% / 0.08);
  --shadow-md: 0px 4px 12px 0px hsl(27.27 10.48% 20.59% / 0.08), 0px 2px 4px -1px hsl(27.27 10.48% 20.59% / 0.08);
  --shadow-lg: 0px 4px 12px 0px hsl(27.27 10.48% 20.59% / 0.08), 0px 4px 6px -1px hsl(27.27 10.48% 20.59% / 0.08);

  color-scheme: light;
}

.dark {
  --background: oklch(0.2225 0.0041 84.5879);
  --foreground: oklch(0.9428 0.0153 77.0696);
  --card: oklch(0.2617 0.0047 67.6183);
  --card-foreground: oklch(0.9428 0.0153 77.0696);
  --popover: oklch(0.2225 0.0041 84.5879);
  --popover-foreground: oklch(0.9428 0.0153 77.0696);
  --muted: oklch(0.3109 0.0082 75.2711);
  --muted-foreground: oklch(0.7002 0.0201 75.2529);
  --accent: oklch(0.3983 0.0175 74.1664);
  --accent-foreground: oklch(0.9428 0.0153 77.0696);

  --primary: oklch(0.7298 0.0667 143.5089);
  --primary-foreground: oklch(0.2225 0.0041 84.5879);
  --secondary: oklch(0.7803 0.043 215.544);
  --secondary-foreground: oklch(0.2225 0.0041 84.5879);
  --destructive: oklch(0.5175 0.1062 29.4814);
  --destructive-foreground: oklch(1 0 0);

  --border: oklch(0.3469 0.0102 73.5699);
  --input: oklch(0.2749 0.007 67.5293);
  --ring: oklch(0.7298 0.0667 143.5089);

  --chart-1: oklch(0.7298 0.0667 143.5089);
  --chart-2: oklch(0.7803 0.043 215.544);
  --chart-3: oklch(0.7507 0.1295 79.8494);
  --chart-4: oklch(0.5175 0.1062 29.4814);
  --chart-5: oklch(0.5849 0.0683 312.9161);

  --sidebar: oklch(0.1965 0.0026 67.6778);
  --sidebar-foreground: oklch(0.9428 0.0153 77.0696);
  --sidebar-primary: oklch(0.7298 0.0667 143.5089);
  --sidebar-primary-foreground: oklch(0.2225 0.0041 84.5879);
  --sidebar-accent: oklch(0.2617 0.0047 67.6183);
  --sidebar-accent-foreground: oklch(0.9428 0.0153 77.0696);
  --sidebar-border: oklch(0.3469 0.0102 73.5699);
  --sidebar-ring: oklch(0.7298 0.0667 143.5089);

  --font-mono: "Special Elite", ui-serif, serif;

  --shadow-xs: 0px 8px 20px 0px hsl(0 0% 0% / 0.2);
  --shadow-sm: 0px 8px 20px 0px hsl(0 0% 0% / 0.4), 0px 1px 2px -1px hsl(0 0% 0% / 0.4);
  --shadow-md: 0px 8px 20px 0px hsl(0 0% 0% / 0.4), 0px 2px 4px -1px hsl(0 0% 0% / 0.4);
  --shadow-lg: 0px 8px 20px 0px hsl(0 0% 0% / 0.4), 0px 4px 6px -1px hsl(0 0% 0% / 0.4);

  color-scheme: dark;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-mono: var(--font-mono);
  --radius: var(--radius);
}

html,
body,
#root {
  height: 100%;
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  letter-spacing: var(--tracking-normal);
  -webkit-font-smoothing: antialiased;
}

/* Helper classes that would be noisy as Tailwind arbitrary values. Token-driven only. */

.kz-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
  vertical-align: middle;
  border: 1px solid color-mix(in oklch, var(--border) 60%, transparent);
}

.kz-brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--primary);
  color: var(--primary-foreground);
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
}

.kz-empty-glyph {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: color-mix(in oklch, var(--primary) 12%, var(--card));
  color: var(--primary);
  display: grid;
  place-items: center;
}

.kz-empty-step-num {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.kz-empty-step-num[data-state="done"] {
  background: var(--primary);
  color: var(--primary-foreground);
}

.kz-empty-step-num[data-state="todo"] {
  background: transparent;
  color: var(--muted-foreground);
  border: 1px solid var(--border);
}

.kz-ws-grid {
  display: grid;
  gap: 3px;
  font-size: 11px;
}

.kz-ws-cell {
  background: var(--muted);
  border-radius: 4px;
  padding: 6px 8px;
  min-height: 36px;
  font-family: var(--font-mono);
  color: var(--muted-foreground);
}

.kz-ws-cell[data-variant="header"] {
  background: transparent;
  text-align: center;
  font-weight: 600;
  color: var(--foreground);
}

.kz-ws-cell[data-variant="time"] {
  background: transparent;
  text-align: right;
  color: var(--muted-foreground);
  padding-right: 10px;
}

.kz-ws-cell[data-variant="period"] {
  background: color-mix(in oklch, var(--primary) 15%, var(--card));
  color: var(--foreground);
  border: 1px solid color-mix(in oklch, var(--primary) 25%, transparent);
}
```

- [ ] **Step 1.2: Start dev server and eyeball the result**

Run:
```bash
mise run fe:dev
```
Open http://localhost:5173/, log in, confirm:
- Background is warm off-white (not pure white).
- Body text is Quicksand (not system sans).
- Buttons are moss-green (primary color changed).
- Toggle to dark mode: background is dark brown, mono font (if visible on any element) swaps to Special Elite.

If visuals look broken, check the dev-server console and `document.fonts.ready` loading state. Kill the dev server after confirmation.

- [ ] **Step 1.3: Run frontend lint and tests**

Run:
```bash
mise run fe:lint
mise run fe:test
```
Expected: both pass. Existing test assertions are semantic, not visual, so colors don't matter.

- [ ] **Step 1.4: Commit**

```bash
git add frontend/src/styles/app.css
git commit -m "feat(frontend): adopt PK design tokens and fonts"
```

---

## Task 2: Sidebar provider + collapsible sidebar

**Files:**
- Create: `frontend/src/components/sidebar-provider.tsx`
- Create: `frontend/src/components/app-sidebar.tsx`
- Modify: `frontend/src/components/layout/app-shell.tsx`
- Create: `frontend/tests/sidebar-provider.test.tsx`
- Create: `frontend/tests/app-shell.test.tsx`
- Modify: `frontend/src/i18n/locales/en.json`, `frontend/src/i18n/locales/de.json`

- [ ] **Step 2.1: Write the failing test for SidebarProvider**

Create `frontend/tests/sidebar-provider.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SidebarProvider, useSidebar } from "@/components/sidebar-provider";

function wrap({ children }: { children: ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

describe("SidebarProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to not collapsed", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: wrap });
    expect(result.current.collapsed).toBe(false);
  });

  it("restores collapsed state from localStorage", () => {
    localStorage.setItem("kz_sidebar_collapsed", "1");
    const { result } = renderHook(() => useSidebar(), { wrapper: wrap });
    expect(result.current.collapsed).toBe(true);
  });

  it("toggle flips state and persists", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: wrap });
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem("kz_sidebar_collapsed")).toBe("1");
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem("kz_sidebar_collapsed")).toBe("0");
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `mise exec -- pnpm -C frontend vitest run tests/sidebar-provider.test.tsx`
Expected: FAIL with "Cannot find module '@/components/sidebar-provider'".

- [ ] **Step 2.3: Implement SidebarProvider**

Create `frontend/src/components/sidebar-provider.tsx`:

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "kz_sidebar_collapsed";

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  function setCollapsed(value: boolean) {
    setCollapsedState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    }
  }

  function toggle() {
    setCollapsed(!collapsed);
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used inside SidebarProvider");
  }
  return ctx;
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `mise exec -- pnpm -C frontend vitest run tests/sidebar-provider.test.tsx`
Expected: 3 passing.

- [ ] **Step 2.5: Add i18n keys for sidebar chrome**

In `frontend/src/i18n/locales/en.json`, add these keys under `nav` and at top level:

```json
{
  "sidebar": {
    "collapse": "Collapse sidebar",
    "expand": "Expand sidebar",
    "main": "Main",
    "data": "Scheduling data",
    "schoolClasses": "School classes",
    "lessons": "Lessons",
    "comingSoon": "Coming soon"
  },
  "nav": {
    "dashboard": "Dashboard",
    "subjects": "Subjects",
    "rooms": "Rooms",
    "teachers": "Teachers",
    "weekSchemes": "Week schemes",
    "logOut": "Log out"
  }
}
```

In `frontend/src/i18n/locales/de.json`, mirror with DE copy:

```json
{
  "sidebar": {
    "collapse": "Seitenleiste einklappen",
    "expand": "Seitenleiste ausklappen",
    "main": "Allgemein",
    "data": "Stammdaten",
    "schoolClasses": "Klassen",
    "lessons": "Unterricht",
    "comingSoon": "Bald verfügbar"
  }
}
```

(Keep existing `nav`, `common`, `auth`, entity-namespaces untouched.)

- [ ] **Step 2.6: Write the failing test for AppShell**

Create `frontend/tests/app-shell.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAppShell } from "./render-helpers";

describe("AppShell sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("shows a sidebar with all nav entries", async () => {
    await renderAppShell();
    expect(await screen.findByRole("link", { name: /dashboard/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /subjects/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /rooms/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /teachers/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /week schemes/i })).toBeVisible();
  });

  it("collapses and expands via the toggle button", async () => {
    const user = userEvent.setup();
    await renderAppShell();
    const toggle = await screen.findByRole("button", { name: /collapse sidebar/i });
    await user.click(toggle);
    expect(localStorage.getItem("kz_sidebar_collapsed")).toBe("1");
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeVisible();
  });
});
```

- [ ] **Step 2.7: Add `renderAppShell` helper**

Open `frontend/tests/render-helpers.tsx`. Add at the bottom:

```tsx
import { AppShell } from "@/components/layout/app-shell";

export async function renderAppShell() {
  return renderWithProviders(
    <AppShell>
      <div data-testid="content" />
    </AppShell>,
    { route: "/" },
  );
}
```

(If `renderWithProviders` accepts different options, adapt the call to match its current signature. Read the existing helper first if uncertain.)

- [ ] **Step 2.8: Run test, expect failure**

Run: `mise exec -- pnpm -C frontend vitest run tests/app-shell.test.tsx`
Expected: FAIL (toggle button not found, or renderAppShell rejects).

- [ ] **Step 2.9: Implement AppSidebar**

Create `frontend/src/components/app-sidebar.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSidebar } from "@/components/sidebar-provider";
import { Button } from "@/components/ui/button";
import { useLogout, useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "sidebar.main",
    items: [{ to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  },
  {
    labelKey: "sidebar.data",
    items: [
      { to: "/subjects", labelKey: "nav.subjects", icon: BookOpen },
      { to: "/rooms", labelKey: "nav.rooms", icon: DoorOpen },
      { to: "/teachers", labelKey: "nav.teachers", icon: GraduationCap },
      { to: "/week-schemes", labelKey: "nav.weekSchemes", icon: CalendarDays },
      { to: "#", labelKey: "sidebar.schoolClasses", icon: Users, disabled: true },
      { to: "#", labelKey: "sidebar.lessons", icon: Layers, disabled: true },
    ],
  },
];

export function AppSidebar() {
  const { t } = useTranslation();
  const { collapsed, toggle } = useSidebar();
  const me = useMe();
  const logout = useLogout();

  const toggleLabel = collapsed ? t("sidebar.expand") : t("sidebar.collapse");

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-14 px-2 py-5" : "w-60 px-4 py-5",
      )}
    >
      <div className="flex items-center gap-2 pb-4">
        {!collapsed ? (
          <>
            <div className="kz-brand-mark">KZ</div>
            <span className="text-base font-semibold tracking-tight">Klassenzeit</span>
          </>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={toggleLabel}
          title={toggleLabel}
          className={cn(collapsed ? "mx-auto" : "ml-auto")}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>

      {NAV_GROUPS.map((group) => (
        <nav key={group.labelKey} className="flex flex-col gap-1 pb-3">
          {!collapsed ? (
            <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t(group.labelKey)}
            </div>
          ) : (
            <div className="h-2" />
          )}
          {group.items.map((item) => {
            const label = t(item.labelKey);
            const Icon = item.icon;
            const base =
              "flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
            if (item.disabled) {
              return (
                <span
                  key={item.labelKey}
                  title={t("sidebar.comingSoon")}
                  className={cn(base, "cursor-not-allowed opacity-50", collapsed && "justify-center")}
                  aria-disabled="true"
                >
                  <Icon className="h-4 w-4" />
                  {!collapsed ? <span>{label}</span> : null}
                </span>
              );
            }
            return (
              <Link
                key={item.labelKey}
                to={item.to}
                className={cn(base, collapsed && "justify-center")}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{
                  className: "bg-sidebar-accent text-sidebar-accent-foreground",
                }}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-4 w-4" />
                {!collapsed ? <span>{label}</span> : null}
              </Link>
            );
          })}
        </nav>
      ))}

      <div className="mt-auto border-t pt-3">
        {!collapsed ? (
          <div className="flex items-center gap-2 px-2 pb-2 text-sm">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-foreground text-xs font-semibold">
              {initials(me.data?.email)}
            </div>
            <span className="text-xs text-muted-foreground">{me.data?.email ?? "…"}</span>
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void logout.mutateAsync();
          }}
          disabled={logout.isPending}
          className={cn("w-full justify-start", collapsed && "justify-center px-0")}
          title={collapsed ? t("nav.logOut") : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed ? <span className="ml-2">{t("nav.logOut")}</span> : null}
        </Button>
      </div>
    </aside>
  );
}

function initials(email: string | undefined) {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}
```

- [ ] **Step 2.10: Rewire AppShell**

Replace `frontend/src/components/layout/app-shell.tsx` with:

```tsx
import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppSidebar } from "@/components/app-sidebar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SidebarProvider } from "@/components/sidebar-provider";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <TopBar />
          <main className="flex-1 px-7 py-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function TopBar() {
  const { t } = useTranslation();
  const matches = useMatches();
  const current = matches[matches.length - 1];
  const crumbKey = currentCrumbKey(current?.pathname ?? "/");
  return (
    <div className="sticky top-0 z-10 flex h-13 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Klassenzeit</span>
        <span className="opacity-50">/</span>
        <span className="font-medium text-foreground">{t(crumbKey)}</span>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </div>
  );
}

function currentCrumbKey(pathname: string) {
  if (pathname.startsWith("/subjects")) return "nav.subjects";
  if (pathname.startsWith("/rooms")) return "nav.rooms";
  if (pathname.startsWith("/teachers")) return "nav.teachers";
  if (pathname.startsWith("/week-schemes")) return "nav.weekSchemes";
  return "nav.dashboard";
}
```

- [ ] **Step 2.11: Rework LanguageSwitcher to a pill style**

Replace `frontend/src/components/language-switcher.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { type Locale, locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (i18n.language.split("-")[0] as Locale) ?? locales[0];

  return (
    <div
      role="group"
      aria-label={t("language.switchTo", { locale: "" }).trim()}
      className="inline-flex rounded-md border bg-muted p-0.5"
    >
      {locales.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => {
              if (!active) void i18n.changeLanguage(loc);
            }}
            aria-pressed={active}
            className={cn(
              "rounded-sm px-2 py-0.5 font-mono text-[11px] font-semibold uppercase",
              active
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {loc}
          </button>
        );
      })}
    </div>
  );
}
```

Note: this change will need a matching update to `tests/language-switcher.test.tsx` in Step 2.12.

- [ ] **Step 2.12: Update language switcher test**

Open `frontend/tests/language-switcher.test.tsx`. The previous test queries by an accessible name like "Switch to DE". In the pill style, each locale button has its label as visible text ("en", "de"). Adapt:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { describe, expect, it } from "vitest";
import { LanguageSwitcher } from "@/components/language-switcher";
import { locales } from "@/i18n/config";

void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: {} }, de: { translation: {} } },
});

describe("LanguageSwitcher", () => {
  it("shows one button per locale", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LanguageSwitcher />
      </I18nextProvider>,
    );
    for (const loc of locales) {
      expect(screen.getByRole("button", { name: loc.toUpperCase() })).toBeVisible();
    }
  });

  it("switches language on click", async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <LanguageSwitcher />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "DE" }));
    expect(i18n.language).toBe("de");
  });
});
```

If the existing test had different imports or a shared setup, reuse those patterns verbatim; just flip the accessible name expectations.

- [ ] **Step 2.13: Run full frontend test suite**

Run: `mise run fe:test`
Expected: all pass. Any failures point to places where the old single-button language switcher was asserted. Fix by mirroring Step 2.12's pattern.

- [ ] **Step 2.14: Visual sanity check**

```bash
mise run fe:dev
```
Log in. Confirm the sidebar toggles between 240px-ish and 56px. When collapsed, nav items show only icons and their `title` tooltip appears on hover. Language switch pill shows EN / DE with the current locale highlighted. Theme toggle still works. Kill the dev server.

- [ ] **Step 2.15: Commit**

```bash
git add frontend/src/components/sidebar-provider.tsx \
        frontend/src/components/app-sidebar.tsx \
        frontend/src/components/layout/app-shell.tsx \
        frontend/src/components/language-switcher.tsx \
        frontend/src/i18n/locales/en.json \
        frontend/src/i18n/locales/de.json \
        frontend/tests/sidebar-provider.test.tsx \
        frontend/tests/app-shell.test.tsx \
        frontend/tests/language-switcher.test.tsx \
        frontend/tests/render-helpers.tsx
git commit -m "feat(frontend): collapsible sidebar with Claude-style toggle"
```

---

## Task 3: Shared EmptyState and Toolbar

**Files:**
- Create: `frontend/src/components/empty-state.tsx`
- Create: `frontend/src/components/toolbar.tsx`
- Create: `frontend/tests/empty-state.test.tsx`
- Modify: `frontend/src/i18n/locales/{en,de}.json` (add `common.search`, `common.noResults`, `common.new`, `common.import`)

- [ ] **Step 3.1: Write the failing EmptyState test**

Create `frontend/tests/empty-state.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/empty-state";

describe("EmptyState", () => {
  it("renders title, body, three steps, and calls onCreate when clicked", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <EmptyState
        icon={<svg data-testid="glyph" />}
        title="No rooms yet"
        body="Create a room so the solver knows where lessons take place."
        steps={["Add a room", "Mark specialized rooms", "Set availability"]}
        createLabel="New room"
        onCreate={onCreate}
      />,
    );
    expect(screen.getByText("No rooms yet")).toBeVisible();
    expect(screen.getByText(/create a room so the solver/i)).toBeVisible();
    expect(screen.getByText("Add a room")).toBeVisible();
    expect(screen.getByText("Mark specialized rooms")).toBeVisible();
    expect(screen.getByText("Set availability")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /new room/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3.2: Run it, expect failure**

Run: `mise exec -- pnpm -C frontend vitest run tests/empty-state.test.tsx`
Expected: FAIL ("Cannot find module '@/components/empty-state'").

- [ ] **Step 3.3: Implement EmptyState**

Create `frontend/src/components/empty-state.tsx`:

```tsx
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  steps: [string, string, string];
  createLabel: string;
  onCreate: () => void;
}

export function EmptyState({ icon, title, body, steps, createLabel, onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3.5 rounded-xl border border-dashed bg-card px-8 py-9 text-center">
      <div className="kz-empty-glyph">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      <div className="flex flex-wrap justify-center gap-3 pt-1">
        {steps.map((label, i) => (
          <div
            key={label}
            className="flex min-w-[180px] items-center gap-2 rounded-md border bg-background px-3 py-2 text-[13px]"
          >
            <div className="kz-empty-step-num" data-state={i === 0 ? "done" : "todo"}>
              {i + 1}
            </div>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <Button onClick={onCreate} className="mt-1">
        <Plus className="mr-1 h-4 w-4" />
        {createLabel}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3.4: Pass the test**

Run: `mise exec -- pnpm -C frontend vitest run tests/empty-state.test.tsx`
Expected: PASS.

- [ ] **Step 3.5: Implement Toolbar**

Create `frontend/src/components/toolbar.tsx`:

```tsx
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export interface ToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  right?: ReactNode;
}

export function Toolbar({ search, onSearch, placeholder, right }: ToolbarProps) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
      <div className="flex h-8 min-w-[220px] items-center gap-1.5 rounded-md border bg-input px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
          className="h-6 border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      <div className="flex-1" />
      {right}
    </div>
  );
}
```

- [ ] **Step 3.6: Add common i18n keys**

In `frontend/src/i18n/locales/en.json`, add under `common`:

```json
"new": "New",
"import": "Import",
"search": "Search",
"noResults": "No matches. Try a different search."
```

In `de.json`:

```json
"new": "Neu",
"import": "Importieren",
"search": "Suchen",
"noResults": "Keine Treffer. Andere Suche versuchen."
```

- [ ] **Step 3.7: Run the suite**

Run: `mise run fe:test`
Expected: still green.

- [ ] **Step 3.8: Commit**

```bash
git add frontend/src/components/empty-state.tsx \
        frontend/src/components/toolbar.tsx \
        frontend/tests/empty-state.test.tsx \
        frontend/src/i18n/locales/en.json \
        frontend/src/i18n/locales/de.json
git commit -m "feat(frontend): add shared EmptyState and Toolbar components"
```

---

## Task 4: CRUD pages redesign (dense tables + empty states + search)

Four sub-tasks, one per entity. Pattern is identical: wrap table in a shared `Toolbar` with URL-backed search, add empty-state for zero-item lists, densify rows, extend i18n for new copy. Work in this order: Subjects → Rooms → Teachers (three dense tables), then Week schemes (split view in Task 5).

For each entity, the new route file uses `validateSearch` with a Zod schema so search / sort state lives in the URL. `create=1` triggers the create dialog.

- [ ] **Step 4.1: Extend i18n with entity copy**

In `frontend/src/i18n/locales/en.json`, add under each entity namespace (`subjects`, `rooms`, `teachers`, `weekSchemes`):

```json
"subtitle": "…per-entity subtitle…",
"empty": {
  "title": "…empty-state heading…",
  "body": "…one-paragraph explanation…",
  "step1": "…first step…",
  "step2": "…second step…",
  "step3": "…third step…"
}
```

Use this exact copy:

- `subjects.subtitle` = `"The catalogue of subjects taught at the school."`
- `subjects.empty.title` = `"Start with your subject catalogue"`
- `subjects.empty.body` = `"Subjects are the foundation — they feed curricula, lessons, and room suitability. Add the core subjects first."`
- `subjects.empty.step1` = `"Add a subject"`, `step2` = `"Assign a colour"`, `step3` = `"Use in a curriculum"`
- `rooms.subtitle` = `"Physical rooms and specialised facilities."`
- `rooms.empty.title` = `"No rooms yet"`
- `rooms.empty.body` = `"Create a room so the solver knows where lessons can take place. Add general classrooms first, then specialised rooms like the science lab."`
- `rooms.empty.step1` = `"Add a general room"`, `step2` = `"Mark specialised rooms"`, `step3` = `"Set availability"`
- `teachers.subtitle` = `"Staff, workload caps, and qualifications."`
- `teachers.empty.title` = `"No teachers on staff"`
- `teachers.empty.body` = `"Add your teaching staff with their weekly hour caps. The solver uses this to respect workload contracts."`
- `teachers.empty.step1` = `"Add a teacher"`, `step2` = `"Set qualifications"`, `step3` = `"Set availability"`
- `weekSchemes.subtitle` = `"The weekly time grid — periods, breaks, and days."`
- `weekSchemes.empty.title` = `"No week schemes yet"`
- `weekSchemes.empty.body` = `"A week scheme defines the periods and breaks of a school day. Most schools have one default scheme; create variants for special weeks."`
- `weekSchemes.empty.step1` = `"Name the scheme"`, `step2` = `"Add time blocks"`, `step3` = `"Assign to classes"`

Mirror in `de.json` using these translations:

- `subjects.subtitle` = `"Der Fächerkatalog der Schule."`
- `subjects.empty.title` = `"Fächerkatalog anlegen"`
- `subjects.empty.body` = `"Fächer sind die Grundlage — sie fließen in Stundentafeln, Unterricht und Raumeignung ein. Beginne mit den Kernfächern."`
- `subjects.empty.step1` = `"Fach anlegen"`, `step2` = `"Farbe zuweisen"`, `step3` = `"In Stundentafel nutzen"`
- `rooms.subtitle` = `"Räume und Fachräume der Schule."`
- `rooms.empty.title` = `"Noch keine Räume"`
- `rooms.empty.body` = `"Lege einen Raum an, damit der Solver weiß, wo Unterricht stattfinden kann. Beginne mit allgemeinen Klassenräumen, danach Fachräume."`
- `rooms.empty.step1` = `"Klassenraum anlegen"`, `step2` = `"Fachräume kennzeichnen"`, `step3` = `"Verfügbarkeit setzen"`
- `teachers.subtitle` = `"Kollegium und Deputate."`
- `teachers.empty.title` = `"Noch keine Lehrkräfte"`
- `teachers.empty.body` = `"Füge das Kollegium mit Stundendeputat hinzu. Der Solver berücksichtigt damit Vertragsarbeitszeiten."`
- `teachers.empty.step1` = `"Lehrkraft anlegen"`, `step2` = `"Fakultas setzen"`, `step3` = `"Verfügbarkeit setzen"`
- `weekSchemes.subtitle` = `"Das wöchentliche Zeitraster — Stunden, Pausen, Tage."`
- `weekSchemes.empty.title` = `"Noch keine Wochenraster"`
- `weekSchemes.empty.body` = `"Ein Wochenraster definiert Stunden und Pausen. Meist genügt ein Standardraster; Varianten für Sonderwochen sind möglich."`
- `weekSchemes.empty.step1` = `"Raster benennen"`, `step2` = `"Zeitblöcke hinzufügen"`, `step3` = `"Klassen zuweisen"`

- [ ] **Step 4.2: Add `validateSearch` schema to the Subjects route**

Modify `frontend/src/routes/_authed.subjects.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SubjectsPage } from "@/features/subjects/subjects-page";

const subjectsSearchSchema = z.object({
  q: z.string().optional(),
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authed/subjects")({
  component: SubjectsPage,
  validateSearch: subjectsSearchSchema,
});
```

Repeat for `_authed.rooms.tsx`, `_authed.teachers.tsx`, `_authed.week-schemes.tsx` with the same schema (q string optional, create literal "1" optional). For week schemes add `id: z.string().optional()` for the split-view selection.

- [ ] **Step 4.3: Redesign SubjectsPage**

Replace `frontend/src/features/subjects/subjects-page.tsx` with a page that: (1) reads `q` and `create` from route search, (2) filters the list locally, (3) shows empty-state when no items and no filter, (4) renders a dense shadcn table with subject Name (plus swatch), Short name, Color block, and actions, (5) pre-opens the create dialog when `?create=1`.

Because the dialog + mutation code is already present and working, keep its body; only the list / toolbar / empty markup changes. Borrow the `Subject` type from `./hooks`.

Use the existing `<Button>`, `<Table>`, `<Dialog>` primitives. Densify rows with a className on `<TableCell>`:

```tsx
<TableCell className="py-1.5">…</TableCell>
```

Color swatch is derived per-subject from `id` → a stable index into `[chart-1 … chart-5]`:

```tsx
function subjectColor(id: string): string {
  const idx = (stableHash(id) % 5) + 1;
  return `var(--chart-${idx})`;
}
function stableHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
```

Render swatch with `<span className="kz-swatch" style={{ background: subjectColor(subject.id) }} />`. Inline `style` here is acceptable because the color is dynamic data.

Pre-open the create dialog using the URL:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
…
const search = useSearch({ from: "/_authed/subjects" });
const navigate = useNavigate({ from: "/_authed/subjects" });
const [creating, setCreating] = useState(() => search.create === "1");

// When user closes the dialog, also drop the query param:
function closeCreate() {
  setCreating(false);
  if (search.create) {
    void navigate({ search: (prev) => ({ ...prev, create: undefined }) });
  }
}
```

Full page component (replace the entire file):

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubjectFormDialog, DeleteSubjectDialog } from "./subjects-dialogs";
import type { Subject } from "./hooks";
import { useSubjects } from "./hooks";

export function SubjectsPage() {
  const { t } = useTranslation();
  const subjects = useSubjects();
  const search = useSearch({ from: "/_authed/subjects" });
  const navigate = useNavigate({ from: "/_authed/subjects" });

  const q = search.q ?? "";
  const setQ = (value: string) => {
    void navigate({ search: (prev) => ({ ...prev, q: value || undefined }) });
  };

  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Subject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Subject | null>(null);

  function closeCreate() {
    setCreating(false);
    if (search.create) {
      void navigate({ search: (prev) => ({ ...prev, create: undefined }) });
    }
  }

  const rows = (subjects.data ?? []).filter((row) =>
    q ? row.name.toLowerCase().includes(q.toLowerCase()) : true,
  );

  const showEmpty = subjects.data && subjects.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <PageHead
        title={t("subjects.title")}
        subtitle={t("subjects.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("subjects.new")}
      />

      {subjects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : subjects.isError ? (
        <p className="text-sm text-destructive">{t("subjects.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title={t("subjects.empty.title")}
          body={t("subjects.empty.body")}
          steps={[t("subjects.empty.step1"), t("subjects.empty.step2"), t("subjects.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("subjects.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("subjects.title").toLowerCase()}
              </span>
            }
          />
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("subjects.columns.name")}</TableHead>
                  <TableHead className="py-2">{t("subjects.columns.shortName")}</TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("subjects.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell className="py-1.5 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="kz-swatch"
                          style={{ background: subjectColor(subject.id) }}
                        />
                        {subject.name}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-[12.5px]">
                      {subject.short_name}
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(subject)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="ml-2"
                        onClick={() => setConfirmDelete(subject)}
                      >
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <SubjectFormDialog
        open={creating}
        onOpenChange={(open) => (open ? setCreating(true) : closeCreate())}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <SubjectFormDialog
          open={true}
          subject={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteSubjectDialog
          subject={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}

function PageHead({
  title,
  subtitle,
  onCreate,
  createLabel,
}: {
  title: string;
  subtitle: string;
  onCreate: () => void;
  createLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled title={t("sidebar.comingSoon")}>
          {t("common.import")}
        </Button>
        <Button onClick={onCreate}>{createLabel}</Button>
      </div>
    </div>
  );
}

function subjectColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const idx = (Math.abs(hash) % 5) + 1;
  return `var(--chart-${idx})`;
}
```

Split the existing create / edit / delete dialogs out into `frontend/src/features/subjects/subjects-dialogs.tsx`. Copy the current `SubjectFormDialog` and `DeleteSubjectDialog` bodies verbatim from the pre-redesign file; the only change is that the `submitLabel` prop comes from the caller. Update the `open`/`onOpenChange` plumbing so a single dialog component supports both create (no subject prop) and edit (subject prop).

- [ ] **Step 4.4: Keep the subjects page test green**

Open `frontend/tests/subjects-page.test.tsx`. If it asserts specific column headers ("Short name"), those still render. If it queries `role="button"` for a specific text, keep those. The only likely drift is an "empty" assertion: the old `empty` copy was `"No subjects yet. Create one to get started."`; the new empty state shows the longer guided copy. If the test hits the empty path, update the assertion to `screen.findByText(/start with your subject catalogue/i)`.

Run: `mise exec -- pnpm -C frontend vitest run tests/subjects-page.test.tsx`
Expected: passes (either as-is or after tweaking the empty-state assertion).

- [ ] **Step 4.5: Redesign RoomsPage**

Apply the same pattern to `frontend/src/features/rooms/rooms-page.tsx`:
- split create / edit / delete dialogs into `rooms-dialogs.tsx` (keep body verbatim, adjust props to match the subjects pattern).
- `q` + `create` search params on the route file (done in Step 4.2).
- Empty state with `DoorOpen` icon.
- Dense table columns: Name, Short, Capacity (right-aligned mono), Mode (badge), Actions.
- Mode badge: use a plain `<span>` with Tailwind: `<span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", mode === "specialized" ? "border-secondary/40 bg-secondary/15 text-secondary" : "bg-muted text-muted-foreground")}>` … `</span>`.
- Capacity column with `<TableCell className="py-1.5 text-right font-mono text-[12.5px]">{room.capacity ?? "—"}</TableCell>`.

Use the same `PageHead` pattern (import it from a shared location or duplicate per file — duplicate is fine, three lines).

- [ ] **Step 4.6: Verify Rooms tests still pass**

Run: `mise exec -- pnpm -C frontend vitest run tests/rooms-page.test.tsx`
Expected: passes. If an assertion hits the empty state, update it to match `rooms.empty.title`.

- [ ] **Step 4.7: Redesign TeachersPage**

Same pattern for `frontend/src/features/teachers/teachers-page.tsx`:
- Split dialogs into `teachers-dialogs.tsx`.
- Search / create URL params.
- Empty state with `GraduationCap`.
- Dense columns: Last name + first name (compose as "Lastname, Firstname"), Short code (mono), Max hours/week (right-aligned mono), Actions.
- Sort the rows client-side by `last_name` before rendering.

- [ ] **Step 4.8: Verify Teachers tests still pass**

Run: `mise exec -- pnpm -C frontend vitest run tests/teachers-page.test.tsx`
Expected: passes. Update empty-state assertion if needed.

- [ ] **Step 4.9: Run all tests**

Run: `mise run fe:test`
Expected: all green.

- [ ] **Step 4.10: Commit**

```bash
git add frontend/src/features/subjects \
        frontend/src/features/rooms \
        frontend/src/features/teachers \
        frontend/src/routes/_authed.subjects.tsx \
        frontend/src/routes/_authed.rooms.tsx \
        frontend/src/routes/_authed.teachers.tsx \
        frontend/src/i18n/locales/en.json \
        frontend/src/i18n/locales/de.json \
        frontend/tests/subjects-page.test.tsx \
        frontend/tests/rooms-page.test.tsx \
        frontend/tests/teachers-page.test.tsx
git commit -m "feat(frontend): redesign Subjects Rooms Teachers CRUD pages"
```

---

## Task 5: Week schemes split view

**Files:**
- Modify: `frontend/src/features/week-schemes/week-schemes-page.tsx`
- Modify: `frontend/src/routes/_authed.week-schemes.tsx`
- Modify: `frontend/tests/week-schemes-page.test.tsx`

- [ ] **Step 5.1: Confirm route schema has `id` param**

`frontend/src/routes/_authed.week-schemes.tsx` should already have `id: z.string().optional()` from Step 4.2. Verify.

- [ ] **Step 5.2: Redesign WeekSchemesPage as a split view**

Replace the existing body. Layout:

```
┌─────────────────────────────────────────────┐
│  Page head + Toolbar                        │
├──────────┬──────────────────────────────────┤
│  List    │  Detail with big grid preview    │
└──────────┴──────────────────────────────────┘
```

Selection comes from `?id=` URL param; falls back to the first scheme.

Key components:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  WeekSchemeFormDialog,
  DeleteWeekSchemeDialog,
} from "./week-schemes-dialogs";
import type { WeekScheme } from "./hooks";
import { useWeekSchemes } from "./hooks";

const DEFAULT_DAYS = 5;
const DEFAULT_PERIODS = 8;

export function WeekSchemesPage() {
  const { t, i18n } = useTranslation();
  const schemes = useWeekSchemes();
  const search = useSearch({ from: "/_authed/week-schemes" });
  const navigate = useNavigate({ from: "/_authed/week-schemes" });

  const q = search.q ?? "";
  const setQ = (value: string) => {
    void navigate({ search: (prev) => ({ ...prev, q: value || undefined }) });
  };

  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<WeekScheme | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WeekScheme | null>(null);

  function closeCreate() {
    setCreating(false);
    if (search.create) {
      void navigate({ search: (prev) => ({ ...prev, create: undefined }) });
    }
  }

  const rows = (schemes.data ?? []).filter((row) =>
    q ? `${row.name} ${row.description ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const activeId = search.id ?? rows[0]?.id;
  const active = rows.find((row) => row.id === activeId) ?? rows[0];

  const showEmpty = schemes.data && schemes.data.length === 0 && !q;
  const days = dayLabels(i18n.language);

  return (
    <div className="space-y-4">
      <PageHead
        title={t("weekSchemes.title")}
        subtitle={t("weekSchemes.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("weekSchemes.new")}
      />

      {schemes.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : schemes.isError ? (
        <p className="text-sm text-destructive">{t("weekSchemes.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<CalendarDays className="h-7 w-7" />}
          title={t("weekSchemes.empty.title")}
          body={t("weekSchemes.empty.body")}
          steps={[t("weekSchemes.empty.step1"), t("weekSchemes.empty.step2"), t("weekSchemes.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("weekSchemes.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("weekSchemes.title").toLowerCase()}
              </span>
            }
          />
          <div className="grid min-h-[520px] grid-cols-[300px_1fr] overflow-hidden rounded-xl border bg-card">
            <div className="overflow-y-auto border-r">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() =>
                    void navigate({ search: (prev) => ({ ...prev, id: row.id }) })
                  }
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b px-3.5 py-2.5 text-left hover:bg-accent",
                    active?.id === row.id && "bg-primary/10",
                  )}
                >
                  <span className="text-sm font-semibold">{row.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {DEFAULT_DAYS} × {DEFAULT_PERIODS}
                  </span>
                </button>
              ))}
            </div>
            <div className="p-5">
              {active ? (
                <>
                  <h2 className="text-xl font-bold">{active.name}</h2>
                  {active.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
                  ) : null}
                  <div className="mt-4">
                    <div
                      className="kz-ws-grid"
                      style={{ gridTemplateColumns: `80px repeat(${DEFAULT_DAYS}, 1fr)` }}
                    >
                      <div className="kz-ws-cell" data-variant="header" />
                      {days.map((day) => (
                        <div key={day} className="kz-ws-cell" data-variant="header">
                          {day}
                        </div>
                      ))}
                      {Array.from({ length: DEFAULT_PERIODS }).map((_, period) => (
                        <WsRow
                          key={period}
                          period={period}
                          days={days}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2">
                    <Button onClick={() => setEditing(active)}>{t("common.edit")}</Button>
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmDelete(active)}
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}

      <WeekSchemeFormDialog
        open={creating}
        onOpenChange={(open) => (open ? setCreating(true) : closeCreate())}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <WeekSchemeFormDialog
          open={true}
          scheme={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteWeekSchemeDialog
          scheme={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}

function WsRow({ period, days }: { period: number; days: string[] }) {
  return (
    <>
      <div className="kz-ws-cell" data-variant="time">
        {formatTime(period)}
      </div>
      {days.map((day, dayIndex) => (
        <div
          key={`${period}-${dayIndex}`}
          className="kz-ws-cell"
          data-variant="period"
        >
          P{period + 1}
        </div>
      ))}
    </>
  );
}

function formatTime(period: number) {
  const hour = 8 + Math.floor(period * 0.75);
  const minute = period % 2 === 0 ? "00" : "45";
  return `${hour}:${minute}`;
}

function dayLabels(lang: string): string[] {
  if (lang.startsWith("de")) return ["Mo", "Di", "Mi", "Do", "Fr"];
  return ["Mo", "Tu", "We", "Th", "Fr"];
}

function PageHead({
  title,
  subtitle,
  onCreate,
  createLabel,
}: {
  title: string;
  subtitle: string;
  onCreate: () => void;
  createLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled title={t("sidebar.comingSoon")}>
          {t("common.import")}
        </Button>
        <Button onClick={onCreate}>{createLabel}</Button>
      </div>
    </div>
  );
}
```

Split the existing create / edit / delete dialogs into `week-schemes-dialogs.tsx` so the page stays readable. Dialog body is copied verbatim.

- [ ] **Step 5.3: Update the week schemes test**

Open `frontend/tests/week-schemes-page.test.tsx`. Likely assertions that currently match a table will need to match the split view (a left-side button per scheme, detail heading on the right). Easiest update:

- Replace `screen.getByRole("row", ...)` with `screen.getByRole("button", { name: /<scheme name>/ })`.
- Add: after rendering, assert `screen.getByRole("heading", { level: 2, name: /<active scheme name>/ })`.

If the existing test opens the create dialog by clicking "New week scheme", that button is still in the PageHead.

Run: `mise exec -- pnpm -C frontend vitest run tests/week-schemes-page.test.tsx`
Expected: passes after the adjustments.

- [ ] **Step 5.4: Run the full suite**

Run: `mise run fe:test`
Expected: all green.

- [ ] **Step 5.5: Commit**

```bash
git add frontend/src/features/week-schemes \
        frontend/src/routes/_authed.week-schemes.tsx \
        frontend/tests/week-schemes-page.test.tsx
git commit -m "feat(frontend): redesign Week schemes as split view with preview grid"
```

---

## Task 6: Dashboard page

**Files:**
- Create: `frontend/src/features/dashboard/dashboard-page.tsx`
- Create: `frontend/src/features/dashboard/stat-grid.tsx`
- Create: `frontend/src/features/dashboard/readiness-checklist.tsx`
- Create: `frontend/src/features/dashboard/next-steps.tsx`
- Create: `frontend/src/features/dashboard/quick-add.tsx`
- Create: `frontend/src/features/dashboard/recently-edited.tsx`
- Modify: `frontend/src/routes/_authed.index.tsx`
- Modify: `frontend/src/i18n/locales/{en,de}.json` (add dashboard.* keys)
- Create: `frontend/tests/dashboard-page.test.tsx`

- [ ] **Step 6.1: Add dashboard i18n keys**

In `en.json`:

```json
"dashboard": {
  "title": "Dashboard",
  "welcome": "Welcome back.",
  "subtitle": "Here is the state of the scheduling data.",
  "stats": {
    "classes": "School classes",
    "teachers": "Teachers",
    "rooms": "Rooms",
    "subjects": "Subjects"
  },
  "readiness": "Scheduling readiness",
  "readinessSub": "What the solver needs before it can run.",
  "readinessItems": {
    "subjectsCatalogue": "Subject catalogue started",
    "roomsDefined": "At least one room defined",
    "teachersDefined": "At least one teacher on staff",
    "weekSchemeDefined": "At least one week scheme defined"
  },
  "nextSteps": "Next steps",
  "nextStepsSub": "A few gaps to close before the solver can run.",
  "quickAdd": "Quick add",
  "recent": "Recently edited",
  "recentPlaceholder": "Recently-edited list will appear once the backend exposes updated_at.",
  "hint": {
    "noTeachers": "No teachers on staff",
    "noTeachersSub": "Add your teaching staff to start.",
    "noSubjects": "No subjects yet",
    "noSubjectsSub": "Start with the core curriculum subjects.",
    "noRooms": "No rooms yet",
    "noRoomsSub": "Add at least one room.",
    "noWeekScheme": "No week scheme defined",
    "noWeekSchemeSub": "Define the weekly time grid."
  },
  "welcomeEmail": "Welcome, {{email}}. Choose an entity from the sidebar to manage."
}
```

Mirror in `de.json` using these translations:

```json
"dashboard": {
  "title": "Übersicht",
  "welcome": "Willkommen zurück.",
  "subtitle": "So sehen die Planungsdaten aus.",
  "stats": {
    "classes": "Klassen",
    "teachers": "Lehrkräfte",
    "rooms": "Räume",
    "subjects": "Fächer"
  },
  "readiness": "Planungsstand",
  "readinessSub": "Was der Solver braucht, bevor er loslegt.",
  "readinessItems": {
    "subjectsCatalogue": "Fächerkatalog begonnen",
    "roomsDefined": "Mindestens ein Raum angelegt",
    "teachersDefined": "Mindestens eine Lehrkraft angelegt",
    "weekSchemeDefined": "Mindestens ein Wochenraster angelegt"
  },
  "nextSteps": "Nächste Schritte",
  "nextStepsSub": "Ein paar Lücken vor dem Solver-Lauf.",
  "quickAdd": "Schnell anlegen",
  "recent": "Zuletzt bearbeitet",
  "recentPlaceholder": "Die Liste erscheint, sobald das Backend updated_at liefert.",
  "hint": {
    "noTeachers": "Noch keine Lehrkräfte",
    "noTeachersSub": "Lege das Kollegium an.",
    "noSubjects": "Noch keine Fächer",
    "noSubjectsSub": "Beginne mit den Kernfächern.",
    "noRooms": "Noch keine Räume",
    "noRoomsSub": "Lege mindestens einen Raum an.",
    "noWeekScheme": "Noch kein Wochenraster",
    "noWeekSchemeSub": "Definiere das wöchentliche Raster."
  },
  "welcomeEmail": "Willkommen, {{email}}. Wähle eine Rubrik in der Seitenleiste."
}
```

- [ ] **Step 6.2: Write the failing dashboard test**

Create `frontend/tests/dashboard-page.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./render-helpers";
import { DashboardPage } from "@/features/dashboard/dashboard-page";

describe("DashboardPage", () => {
  it("renders stat cards with live counts", async () => {
    await renderWithProviders(<DashboardPage />, { route: "/" });
    expect(await screen.findByRole("heading", { level: 1, name: /welcome back/i })).toBeVisible();
    expect(screen.getByText(/subjects/i)).toBeVisible();
    expect(screen.getByText(/teachers/i)).toBeVisible();
    expect(screen.getByText(/rooms/i)).toBeVisible();
    expect(screen.getByText(/week scheme/i)).toBeVisible();
  });
});
```

(The existing MSW handlers return non-empty seed data for subjects, rooms, teachers, week-schemes. That's enough to exercise the stat-grid path.)

- [ ] **Step 6.3: Run it, expect failure**

Run: `mise exec -- pnpm -C frontend vitest run tests/dashboard-page.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 6.4: Implement the stat grid**

Create `frontend/src/features/dashboard/stat-grid.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useRooms } from "@/features/rooms/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTeachers } from "@/features/teachers/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";

export function StatGrid() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const teachers = useTeachers();
  const subjects = useSubjects();
  const weekSchemes = useWeekSchemes();

  const items = [
    { label: t("dashboard.stats.classes"), value: "0" },
    { label: t("dashboard.stats.teachers"), value: formatCount(teachers.data?.length) },
    { label: t("dashboard.stats.rooms"), value: formatCount(rooms.data?.length) },
    { label: t("dashboard.stats.subjects"), value: formatCount(subjects.data?.length) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {item.label}
          </span>
          <span className="text-3xl font-bold tracking-tight">{item.value}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {t("dashboard.subtitle")}
          </span>
        </div>
      ))}
      <span className="sr-only">{weekSchemes.data?.length ?? 0}</span>
    </div>
  );
}

function formatCount(value: number | undefined) {
  if (value === undefined) return "…";
  return new Intl.NumberFormat().format(value);
}
```

- [ ] **Step 6.5: Implement the readiness checklist**

Create `frontend/src/features/dashboard/readiness-checklist.tsx`:

```tsx
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRooms } from "@/features/rooms/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTeachers } from "@/features/teachers/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";
import { cn } from "@/lib/utils";

export function ReadinessChecklist() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const teachers = useTeachers();
  const subjects = useSubjects();
  const weekSchemes = useWeekSchemes();

  const items = [
    { key: "subjectsCatalogue", ok: (subjects.data?.length ?? 0) > 0 },
    { key: "roomsDefined", ok: (rooms.data?.length ?? 0) > 0 },
    { key: "teachersDefined", ok: (teachers.data?.length ?? 0) > 0 },
    { key: "weekSchemeDefined", ok: (weekSchemes.data?.length ?? 0) > 0 },
  ];

  const okCount = items.filter((item) => item.ok).length;
  const pct = Math.round((okCount / items.length) * 100);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("dashboard.readiness")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.readinessSub")}</p>
        </div>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-2.5 text-xs font-medium text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {pct}%
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-4 w-4 place-items-center rounded-[4px] border",
                item.ok
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-transparent",
              )}
            >
              {item.ok ? <Check className="h-3 w-3" /> : null}
            </span>
            <span className={cn(item.ok && "text-muted-foreground line-through")}>
              {t(`dashboard.readinessItems.${item.key}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6.6: Implement next-steps tiles**

Create `frontend/src/features/dashboard/next-steps.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CalendarDays, DoorOpen, GraduationCap } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { useRooms } from "@/features/rooms/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTeachers } from "@/features/teachers/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export function NextSteps() {
  const { t } = useTranslation();
  const subjects = useSubjects();
  const teachers = useTeachers();
  const rooms = useRooms();
  const weekSchemes = useWeekSchemes();

  const pending: Array<{
    key: string;
    icon: IconType;
    title: string;
    sub: string;
    to: string;
  }> = [];
  if ((subjects.data?.length ?? 0) === 0) {
    pending.push({
      key: "noSubjects",
      icon: BookOpen,
      title: t("dashboard.hint.noSubjects"),
      sub: t("dashboard.hint.noSubjectsSub"),
      to: "/subjects",
    });
  }
  if ((rooms.data?.length ?? 0) === 0) {
    pending.push({
      key: "noRooms",
      icon: DoorOpen,
      title: t("dashboard.hint.noRooms"),
      sub: t("dashboard.hint.noRoomsSub"),
      to: "/rooms",
    });
  }
  if ((teachers.data?.length ?? 0) === 0) {
    pending.push({
      key: "noTeachers",
      icon: GraduationCap,
      title: t("dashboard.hint.noTeachers"),
      sub: t("dashboard.hint.noTeachersSub"),
      to: "/teachers",
    });
  }
  if ((weekSchemes.data?.length ?? 0) === 0) {
    pending.push({
      key: "noWeekScheme",
      icon: CalendarDays,
      title: t("dashboard.hint.noWeekScheme"),
      sub: t("dashboard.hint.noWeekSchemeSub"),
      to: "/week-schemes",
    });
  }

  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">{t("dashboard.nextSteps")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.nextStepsSub")}</p>
      </div>
      <ul>
        {pending.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.sub}</div>
              </div>
              <Link
                to={item.to}
                className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent"
              >
                {t("common.edit") /* reuse "Open/Edit" label; safe short string */}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6.7: Implement quick-add**

Create `frontend/src/features/dashboard/quick-add.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarDays, DoorOpen, GraduationCap } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const ITEMS: Array<{
  to: "/subjects" | "/rooms" | "/teachers" | "/week-schemes";
  icon: IconType;
  labelKey: string;
}> = [
  { to: "/subjects", icon: BookOpen, labelKey: "nav.subjects" },
  { to: "/rooms", icon: DoorOpen, labelKey: "nav.rooms" },
  { to: "/teachers", icon: GraduationCap, labelKey: "nav.teachers" },
  { to: "/week-schemes", icon: CalendarDays, labelKey: "nav.weekSchemes" },
];

export function QuickAdd() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{t("dashboard.quickAdd")}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              search={{ create: "1" }}
              className="flex h-14 items-center gap-2 rounded-md border px-3 text-sm hover:bg-accent"
            >
              <Icon className="h-4 w-4" />
              <div className="flex flex-col items-start leading-tight">
                <span className="text-xs text-muted-foreground">{t("common.new")}</span>
                <span>{t(item.labelKey)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6.8: Implement recently-edited placeholder**

Create `frontend/src/features/dashboard/recently-edited.tsx`:

```tsx
import { useTranslation } from "react-i18next";

export function RecentlyEdited() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{t("dashboard.recent")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.recentPlaceholder")}</p>
    </div>
  );
}
```

- [ ] **Step 6.9: Implement the dashboard page**

Create `frontend/src/features/dashboard/dashboard-page.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { NextSteps } from "./next-steps";
import { QuickAdd } from "./quick-add";
import { ReadinessChecklist } from "./readiness-checklist";
import { RecentlyEdited } from "./recently-edited";
import { StatGrid } from "./stat-grid";

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.welcome")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
      </div>
      <StatGrid />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <ReadinessChecklist />
          <NextSteps />
        </div>
        <div className="space-y-4">
          <QuickAdd />
          <RecentlyEdited />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.10: Wire the index route**

Replace `frontend/src/routes/_authed.index.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/dashboard/dashboard-page";

export const Route = createFileRoute("/_authed/")({
  component: DashboardPage,
});
```

- [ ] **Step 6.11: Run the dashboard test and full suite**

Run: `mise exec -- pnpm -C frontend vitest run tests/dashboard-page.test.tsx`
Expected: PASS.

Run: `mise run fe:test`
Expected: all pass.

- [ ] **Step 6.12: Visual sanity check**

```bash
mise run fe:dev
```
Log in and confirm:
- Dashboard renders stat cards with counts from the backend.
- Readiness checklist shows items as done or pending.
- Next-steps tiles show up only for missing categories; each tile's Open link navigates to the entity page.
- Quick-add grid deep-links into each entity page with the create dialog open.
- Recently edited shows the placeholder sentence.

Kill the dev server.

- [ ] **Step 6.13: Commit**

```bash
git add frontend/src/features/dashboard \
        frontend/src/routes/_authed.index.tsx \
        frontend/src/i18n/locales/en.json \
        frontend/src/i18n/locales/de.json \
        frontend/tests/dashboard-page.test.tsx
git commit -m "feat(frontend): add post-login dashboard with readiness + next-steps"
```

---

## Task 7: Documentation and OPEN_THINGS

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`
- Modify: `docs/architecture/overview.md` if applicable
- Modify: `frontend/CLAUDE.md` if new anti-patterns emerge
- Modify: `.claude/CLAUDE.md` (root) only if a root-level rule shifted
- Modify: `README.md` only if new `mise run` tasks landed (none expected)

- [ ] **Step 7.1: Update OPEN_THINGS.md**

Open `docs/superpowers/OPEN_THINGS.md`. Remove any items that became stale (e.g. dashboard placeholder, if it was there). Add, in priority order:

- Backend: expose `updated_at` on entity list endpoints so the dashboard "Recently edited" tile can be wired. Today's placeholder shows static copy only.
- Frontend: add bulk-delete UI + backend endpoints for each entity. The design includes checkbox columns that we dropped until a bulk action lands.
- Frontend: implement import / export flows for each entity. Placeholder buttons currently render disabled with a "Coming soon" title.
- Backend + frontend: teacher qualifications and room suitability as first-class associations (many-to-many with Subject). The design's chip multi-selects cannot render without them.
- Backend + frontend: teacher availability model (grid of per-day-per-period booleans), plus the availability mini-grid visualisation.
- Backend: persisted color on Subject (currently derived client-side from `id`). Moving to a real column avoids churn on subject rename.
- Backend: `active` flag on WeekScheme so the "active" badge in the split view can render.
- Frontend: self-hosted fonts to avoid Google Fonts `@import` for offline dev.
- Frontend: time-of-day-aware welcome greeting on the dashboard.
- Frontend: school classes and lessons pages (placeholders still disabled in the sidebar).

- [ ] **Step 7.2: Update frontend CLAUDE.md with new anti-patterns if any**

If any rule emerged during implementation that isn't already in `frontend/CLAUDE.md`, add it. Candidates:
- "No `SidebarProvider` outside `AppShell`." — the shell owns the provider.
- "New helper classes go in `styles/app.css` under `kz-*` namespace; one-off visuals that combine 5+ tokens qualify." — keeps Tailwind the default.

If unsure, skip. Don't invent rules to justify this task.

- [ ] **Step 7.3: Commit docs**

```bash
git add docs/superpowers/OPEN_THINGS.md frontend/CLAUDE.md 2>/dev/null || true
git commit -m "docs: track design-implementation follow-ups in OPEN_THINGS"
```

(If nothing staged, skip the commit.)

---

## Task 8: Full verification

- [ ] **Step 8.1: Run full lint**

Run: `mise run lint`
Expected: all pass.

- [ ] **Step 8.2: Run full test suite**

Run: `mise run test`
Expected: all pass (Rust + Python + frontend).

- [ ] **Step 8.3: Update coverage baseline if needed**

Run:
```bash
mise run fe:test:cov
```
If the ratchet fails with "coverage dropped below baseline", investigate. If the drop is an accurate reflection of intentionally deferred tests (e.g. dashboard internals), run:
```bash
mise run fe:cov:update-baseline
git add .coverage-baseline-frontend
git commit -m "test(frontend): update coverage baseline after design implementation"
```
If coverage went up (likely: we added several tests), do nothing — ratchet is floor, not ceiling.

- [ ] **Step 8.4: Quick end-to-end smoke**

```bash
mise run fe:dev
```
Log in. Walk through: Dashboard → Subjects → Rooms → Teachers → Week schemes. Confirm: sidebar collapse persists on refresh, language switch flips copy, dark mode still looks right. Kill the dev server.

- [ ] **Step 8.5: Commit any remaining straggler changes, then proceed to PR step in the /autopilot workflow**

`git status` should be clean. If not, review and commit with a focused type (`fix(frontend):` etc.).

---

## Self-review against the spec

- Spec §1 "PK tokens swap" → Task 1.
- Spec §2 "Collapsible sidebar with provider" → Task 2.
- Spec §3 "Pill-style language switch + breadcrumbs" → Task 2 (language-switcher, topbar).
- Spec §4 "Dashboard with stat grid + readiness + next steps + quick add + recently-edited" → Task 6.
- Spec §5 "Dense table redesign for Subjects/Rooms/Teachers, split view for Week schemes, shared Toolbar, shared EmptyState" → Tasks 3, 4, 5.
- Spec §6 "i18n additions" → Task 2.5, 3.6, 4.1, 6.1.
- Spec §7 "Tests for new behaviour" → Tasks 2.1, 2.6, 3.1, 6.2.
- Spec §8 "Open questions → OPEN_THINGS" → Task 7.1.
- Acceptance criteria 1-10 → covered across Tasks 1-8.
