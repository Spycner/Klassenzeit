# Shared toast primitive implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shadcn-style `sonner` Toaster at `frontend/src/components/ui/sonner.tsx`, mount it once in `main.tsx`, and replace the single `window.alert(...)` call site in `school-classes-page.tsx` with `toast.success` / `toast.info`. Preserve all user-visible behaviour.

**Architecture:** One presentational wrapper over `sonner`'s `<Toaster />` reads `useTheme()` from next-themes and forwards the theme prop. The Toaster mounts as a sibling of `<RouterProvider>` inside `ThemeProvider` + `QueryClientProvider`. The `renderWithProviders` test harness mounts the same Toaster so user-flow tests can assert toast copy. One call site migrates; `form.setError("root", ...)` in entity dialogs is out of scope.

**Tech Stack:** React 19, `sonner` (new dep), next-themes (already present), TanStack Router + Query, shadcn/ui, react-i18next, Vitest + React Testing Library, MSW.

**References:** spec at `docs/superpowers/specs/2026-04-20-shared-toast-primitive-design.md`, OPEN_THINGS item "Shared toast primitive", frontend CLAUDE.md "UX conventions" section.

---

## File Structure

- **Create:** `frontend/src/components/ui/sonner.tsx` (~12 LoC). Thin wrapper around `sonner`'s `Toaster` that reads `useTheme()` from next-themes.
- **Create:** `frontend/src/components/ui/sonner.test.tsx` (~60 LoC). Three Vitest tests rendering the wrapper with bare `render()`; no router, no query client, no theme provider (wrapper's `?? "system"` fallback covers the undefined-theme case).
- **Modify:** `frontend/package.json` (via `pnpm add sonner` and `pnpm remove @radix-ui/react-toast`). Do not hand-edit.
- **Modify:** `frontend/src/main.tsx` — import `Toaster` from `@/components/ui/sonner` and mount it inside `QueryClientProvider` as a sibling of `<RouterProvider>`.
- **Modify:** `frontend/tests/render-helpers.tsx` — mount the same `<Toaster />` inside the helper's tree so page-level user-flow tests can assert toast copy.
- **Modify:** `frontend/src/features/school-classes/school-classes-page.tsx:168-172` — replace the `window.alert(msg)` branch with `toast.success(...)` / `toast.info(...)`.
- **Modify:** `frontend/tests/school-classes-page.test.tsx` — add two tests that render the full `SchoolClassesPage`, click the "Unterricht erzeugen" row action plus its confirm button, and assert the success toast (count=1 path) and the info toast (empty-result path, via an MSW override that returns `[]`). Also assert `window.alert` is never invoked. The existing `generate-lessons-dialog.test.tsx` is not modified.

No i18n catalog changes. No mutation changes. No backend changes. No Playwright changes.

---

## Task 1: Install sonner and add the shadcn wrapper

**Files:**
- Modify: `frontend/package.json`, `frontend/pnpm-lock.yaml` (via pnpm).
- Create: `frontend/src/components/ui/sonner.tsx`
- Test: `frontend/src/components/ui/sonner.test.tsx`

- [ ] **Step 1: Install sonner**

Run from the repo root:

```bash
mise exec -- pnpm -C frontend add sonner
```

Expected: `package.json` gains `"sonner": "^<version>"` under `dependencies`; `pnpm-lock.yaml` updates accordingly. Do not hand-edit `package.json`.

- [ ] **Step 2: Write the failing wrapper unit test**

Create `frontend/src/components/ui/sonner.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

describe("Toaster (shadcn sonner wrapper)", () => {
  it("renders without a ThemeProvider (falls back to system theme)", () => {
    render(<Toaster />);
    expect(document.querySelector("[data-sonner-toaster]")).toBeInTheDocument();
  });

  it("shows a success toast with the given message", async () => {
    render(<Toaster />);
    toast.success("Saved successfully");
    expect(await screen.findByText("Saved successfully")).toBeInTheDocument();
  });

  it("shows an info toast with the given message", async () => {
    render(<Toaster />);
    toast.info("Nothing changed");
    expect(await screen.findByText("Nothing changed")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run from `frontend/`:

```bash
cd frontend && mise exec -- pnpm vitest run src/components/ui/sonner.test.tsx
```

Expected: FAIL with `Cannot find module '@/components/ui/sonner'` (or equivalent).

- [ ] **Step 4: Create the wrapper**

Create `frontend/src/components/ui/sonner.tsx`:

```tsx
import { useTheme } from "next-themes";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={(theme as ToasterProps["theme"]) ?? "system"}
      richColors
      closeButton
      {...props}
    />
  );
}
```

- [ ] **Step 5: Run the test and verify it passes**

```bash
cd frontend && mise exec -- pnpm vitest run src/components/ui/sonner.test.tsx
```

Expected: PASS — three tests.

- [ ] **Step 6: Mount the Toaster in `main.tsx`**

Edit `frontend/src/main.tsx`. Add the import near the top:

```tsx
import { Toaster } from "./components/ui/sonner";
```

Update the render call to include `<Toaster />` as a sibling of `<RouterProvider>`:

```tsx
createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: Mount the Toaster in `renderWithProviders`**

Edit `frontend/tests/render-helpers.tsx`. Add the import:

```tsx
import { Toaster } from "@/components/ui/sonner";
```

Update the returned JSX so every rendered tree includes a `<Toaster />`:

```tsx
return {
  queryClient,
  ...render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  ),
};
```

- [ ] **Step 8: Run the full frontend suite to confirm no regressions**

```bash
cd frontend && mise exec -- pnpm vitest run
```

Expected: all existing tests PASS. The new `sonner.test.tsx` also PASSes.

- [ ] **Step 9: Typecheck**

```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
```

Expected: no errors. (If this warns about an unused import in `main.tsx`, the Toaster line is wrong — re-check.)

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml \
  frontend/src/components/ui/sonner.tsx \
  frontend/src/components/ui/sonner.test.tsx \
  frontend/src/main.tsx \
  frontend/tests/render-helpers.tsx
git commit -m "feat(frontend): add shadcn sonner Toaster primitive"
```

---

## Task 2: Replace the Generate-lessons `window.alert` with toast

**Files:**
- Modify: `frontend/src/features/school-classes/school-classes-page.tsx` (lines 162–175)
- Test: `frontend/tests/school-classes-page.test.tsx`

- [ ] **Step 1: Write the failing toast-path test**

Edit `frontend/tests/school-classes-page.test.tsx`. Keep the two existing tests unchanged. Add imports for `http` / `HttpResponse` (from `msw`), `server` (from `./msw-handlers`), and `vi` (from `vitest`). Append a new `describe("Generate-lessons toast", …)` block with two tests. The existing file already pins locale to German in `beforeAll`; the new block inherits that, so assertions use the German copy verbatim from `frontend/src/i18n/locales/de.json`.

The new block appended after the existing `describe("SchoolClassesPage", …)` block:

```tsx
// new imports at the top of the file
import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { server } from "./msw-handlers";

// appended after the existing describe block
describe("SchoolClassesPage Generate-lessons toast", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  beforeEach(() => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a success toast with the interpolated lesson count", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SchoolClassesPage />);
    await screen.findByText("1a");
    const row = screen.getByText("1a").closest("tr");
    if (!row) throw new Error("row for 1a not found");
    await user.click(within(row).getByRole("button", { name: /unterricht erzeugen/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^erzeugen$/i }));

    expect(await screen.findByText(/1 Stunde erzeugt/i)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("shows an info toast when the backend generated no lessons", async () => {
    server.use(
      http.post("http://localhost:3000/api/classes/:class_id/generate-lessons", () =>
        HttpResponse.json([], { status: 201 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SchoolClassesPage />);
    await screen.findByText("1a");
    const row = screen.getByText("1a").closest("tr");
    if (!row) throw new Error("row for 1a not found");
    await user.click(within(row).getByRole("button", { name: /unterricht erzeugen/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^erzeugen$/i }));

    expect(await screen.findByText(/kein neuer unterricht erzeugt/i)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });
});
```

Also add `afterEach` to the top-level vitest imports if the file's existing import line does not already include it (`import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"`).

Key details:

- `server` is imported from `./msw-handlers` (the same file exports `setupServer(...)` as the `server` constant; see the top of `msw-handlers.ts` for the `BASE = "http://localhost:3000"` constant).
- German copy is verbatim from `de.json`: `created_one` → `"{{count}} Stunde erzeugt"` (plural form) and `noneCreated` → `"Kein neuer Unterricht erzeugt"`.
- The MSW override URL uses the same absolute BASE as `msw-handlers.ts`: `http://localhost:3000/api/classes/:class_id/generate-lessons`. Using a wildcard pattern would also work, but the absolute URL matches the default handler and keeps the behaviour identical.
- `vi.restoreAllMocks()` in `afterEach` restores the `window.alert` spy between tests.
- `screen.getByText("1a").closest("tr")` scopes the row action; `within(row)` narrows the "Unterricht erzeugen" / "Erzeugen" buttons to this row and its confirm dialog.

- [ ] **Step 2: Run the failing tests**

```bash
cd frontend && mise exec -- pnpm vitest run tests/school-classes-page.test.tsx
```

Expected: the two new toast tests FAIL — the page still calls `window.alert(...)`, which the spy swallows, so the toast copy never renders and the `not.toHaveBeenCalled()` assertion trips on the pre-existing alert call. The two original tests in the file still PASS.

- [ ] **Step 3: Replace the `window.alert` call site**

Edit `frontend/src/features/school-classes/school-classes-page.tsx`. Add the import at the top of the file near the other `@/components/ui/*` imports:

```tsx
import { toast } from "sonner";
```

Replace lines 162–175 with:

```tsx
{generateFor ? (
  <GenerateLessonsConfirmDialog
    schoolClass={generateFor}
    onDone={(count) => {
      setGenerateFor(null);
      if (count < 0) return;
      if (count === 0) {
        toast.info(t("schoolClasses.generateLessons.noneCreated"));
      } else {
        toast.success(t("schoolClasses.generateLessons.created", { count }));
      }
    }}
  />
) : null}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd frontend && mise exec -- pnpm vitest run tests/school-classes-page.test.tsx
```

Expected: all four tests in the file PASS (two pre-existing + two new toast tests).

- [ ] **Step 5: Run the full frontend suite**

```bash
cd frontend && mise exec -- pnpm vitest run
```

Expected: every test still PASSes.

- [ ] **Step 6: Typecheck**

```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/school-classes/school-classes-page.tsx \
  frontend/tests/school-classes-page.test.tsx
git commit -m "refactor(frontend): use toast for Generate-lessons result"
```

---

## Task 3: Drop unused `@radix-ui/react-toast`

**Files:**
- Modify: `frontend/package.json`, `frontend/pnpm-lock.yaml` (via pnpm).

- [ ] **Step 1: Confirm the dep has zero imports under `src/`**

Run from the repo root:

```bash
mise exec -- rg -l "@radix-ui/react-toast" frontend/src || echo "no matches"
```

Expected output: `no matches`. If any match appears, stop and re-check the spec's assumption before removing the dep.

- [ ] **Step 2: Remove the dep**

```bash
mise exec -- pnpm -C frontend remove @radix-ui/react-toast
```

Expected: `package.json` loses the `@radix-ui/react-toast` line under `dependencies`; `pnpm-lock.yaml` updates.

- [ ] **Step 3: Reinstall and run the full suite to confirm nothing depended on the dep transitively**

```bash
cd frontend && mise exec -- pnpm install && mise exec -- pnpm vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Typecheck**

```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore(frontend): drop unused @radix-ui/react-toast"
```

---

## Task 4: Coverage ratchet check

**Files:**
- Maybe-modify: `.coverage-baseline-frontend` (at repo root). Only if coverage moved.

- [ ] **Step 1: Run the coverage target**

```bash
mise run fe:test:cov
```

Expected: `frontend/coverage/coverage-summary.json` regenerates.

- [ ] **Step 2: Compare against the baseline**

Read the current baseline:

```bash
cat .coverage-baseline-frontend
```

Read the new `total.lines.pct` from the summary:

```bash
mise exec -- node -e 'console.log(require("./frontend/coverage/coverage-summary.json").total.lines.pct)'
```

- [ ] **Step 3: Decide whether to rebaseline**

- If the new pct is `>=` the baseline: no change. Skip steps 4–5.
- If the new pct is below the baseline but above 50% (the absolute floor): go to step 4.
- If the new pct is below 50%: stop and investigate — the new code is under-tested.

- [ ] **Step 4: Rebaseline**

```bash
mise run fe:cov:update-baseline
```

- [ ] **Step 5: Commit the baseline bump (only if step 4 ran)**

```bash
git add .coverage-baseline-frontend
git commit -m "chore: rebaseline frontend coverage after sonner landing"
```

---

## Self-review

**Spec coverage.** Every spec section has a task:

- Component shape / mount point → Task 1 (steps 4, 6).
- Test harness update → Task 1 (step 7).
- Call-site migration → Task 2 (step 3).
- Test additions (wrapper unit tests + page-level integration tests) → Task 1 (step 2) + Task 2 (step 1).
- Dead dep removal → Task 3.
- Coverage impact → Task 4.
- i18n unchanged → no task; verified by lack of edits to `en.json` / `de.json`.

**Placeholder scan.** No `TBD`, `TODO`, or "implement later" strings. Every code block is complete enough to paste.

**Type consistency.** The wrapper's `ToasterProps` import is the real export from `sonner`. The fallback cast `(theme as ToasterProps["theme"])` is narrow and survives minor sonner version bumps. `components["schemas"]["SchoolClassResponse"]` is the existing generated type. The `server` import in Task 2 step 1 notes the fallback path if the test-setup re-export differs; the executor must verify before writing the line.

**Risks called out inline:** MSW override URL must match the default handler's absolute `BASE` (Task 2 step 1 note); coverage ratchet dropping below baseline (Task 4 branching).

---

## Execution handoff

Plan complete. Execute via `superpowers:subagent-driven-development`: Task 1, Task 2, and Task 3 can run sequentially (each touches overlapping shared files, so a fresh subagent per task, one at a time, is the right pattern). Task 4 runs in the main session as a short post-execution check.
