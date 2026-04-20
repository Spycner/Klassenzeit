# Shared toast primitive

**Date:** 2026-04-20
**Status:** Design approved, plan pending.

## Problem

The Klassenzeit frontend has no toast primitive. One user-visible notification site (`features/school-classes/school-classes-page.tsx:172`) falls back to `window.alert(...)` to report the result of the "Generate lessons" row action. Every other surface routes errors through `form.setError("root", ...)` inside the form that owns them, which is fine for validation-style copy but unavailable to page-level actions that have no RHF form in scope.

Both `docs/superpowers/OPEN_THINGS.md` and `frontend/CLAUDE.md` already track this gap:

> Shared toast primitive. The Generate-lessons row action on SchoolClasses falls back to `window.alert(...)` for success and empty-result notification because no toast system is wired yet. Adopt `sonner` (or similar) and replace the `alert` call; also revisit every other user-visible success path for consistency.

The frontend CLAUDE.md "UX conventions" section tightens that further: "When a shared toast lands (tracked in OPEN_THINGS), replace `alert` call sites in one pass rather than hand-rolling per feature."

`package.json` lists `@radix-ui/react-toast ^1.2.15`, but nothing under `src/` imports it. The dep has been sitting unused. Landing a real toast primitive and deleting the dead dep is pure tidy-first cleanup: remove the ad-hoc alert, remove the unused dep, make every future page-level success or info message cheap to wire.

## Goal

Ship a shadcn-style sonner wrapper at `frontend/src/components/ui/sonner.tsx`, mount a single `<Toaster />` in the app root, and migrate the one existing `window.alert(...)` call site to `toast.success` / `toast.info`. Preserve behaviour: both the count-based success path and the empty-result path keep showing their existing i18n copy, just through sonner instead of the browser's native alert.

## Non-goals

- **RHF root-error migration.** `form.setError("root", { message })` is in-dialog validation UX tied to form state; switching it to toasts would change visibility and focus semantics. Tracked separately against the OPEN_THINGS item "Typed deletion errors for in-use entities", which is the right place for the cross-entity 409 pass.
- **Global React Query `onError` bridge.** Routing every uncaught mutation error through a toast is a behavioural change with its own design surface (duplicate-suppression, error translation, status-code routing). Out of scope.
- **New `toasts.*` i18n namespace.** The one migrated call site reuses `schoolClasses.generateLessons.created` / `noneCreated`. A dedicated namespace earns its place when a second cross-entity consumer appears.
- **Playwright coverage.** The Subjects-only E2E tier does not yet exercise SchoolClasses. Adding a Playwright spec for the toast belongs with the broader entity E2E coverage item.
- **Backend changes.** The Generate-lessons endpoint shape (`POST /api/classes/{id}/generate-lessons`) is unchanged.

## Design

### Library choice

`sonner` is the shadcn-recommended Toaster today. The previously-shipped `@radix-ui/react-toast` wrapper was effectively deprecated in shadcn's generator in favour of sonner, and the dep is already dead weight in `package.json`. Sonner owns queueing, stacking, focus management, and aria-live semantics out of the box, so the product code stays thin.

### Component shape

```tsx
// frontend/src/components/ui/sonner.tsx
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

Notes:

- The wrapper reads the current theme from `next-themes` and forwards it so sonner matches the existing light / dark / system toggle. The theme provider (`src/components/theme-provider.tsx`) already configures `attribute="class"`, so sonner's built-in theme classes apply without extra glue.
- `richColors` turns on sonner's variant-tinted backgrounds (green for success, blue for info, red for error). `closeButton` adds a dismiss affordance; shadcn's current recipe enables both by default.
- The `...props` spread lets callers override `position`, `duration`, etc. per feature in the rare case they need to.
- No `forwardRef`; React 19 treats `ref` as a plain prop (frontend CLAUDE.md rule). If sonner ever adds a ref prop, callers can pass it through.

### Mount point

`<Toaster />` mounts in `src/main.tsx` as a sibling of `<RouterProvider>`, inside `ThemeProvider` and `QueryClientProvider`:

```tsx
<ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <Toaster />
  </QueryClientProvider>
</ThemeProvider>
```

Why `main.tsx` rather than `routes/__root.tsx` or `routes/_authed.tsx`:

- Toasts can (and will) fire from pre-auth flows like login error handling in later PRs; the Toaster must live above the route tree.
- `routes/__root.tsx` is a bare `<Outlet />`; adding a portal-owning component there for the sake of a one-level move creates noise and an extra edit target.
- `main.tsx` already owns the other app-level providers, so the mount order is visible in one place.

### Call-site migration

Exactly one site changes in this PR. Current code:

```tsx
// features/school-classes/school-classes-page.tsx (lines 162–175)
<GenerateLessonsConfirmDialog
  schoolClass={generateFor}
  onDone={(count) => {
    setGenerateFor(null);
    if (count < 0) return; // Cancelled
    const msg =
      count === 0
        ? t("schoolClasses.generateLessons.noneCreated")
        : t("schoolClasses.generateLessons.created", { count });
    window.alert(msg);
  }}
/>
```

Target shape:

```tsx
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
```

Behaviour preserved:

- Empty result still shows a user-visible message (`toast.info` instead of `alert`).
- Non-zero success still shows the interpolated message (`toast.success` instead of `alert`).
- Cancel path (`count < 0`) still returns without notification.
- i18n keys and German / English copy are unchanged; the existing `schoolClasses.generateLessons.created` (with `{count}` interpolation) and `noneCreated` entries in both `en.json` and `de.json` stay exactly as they are.
- sonner defaults `duration: 4000`, `position: "bottom-right"`, and `role="status"` for success / info, which is a reasonable replacement for `window.alert`'s blocking modal without loss of visibility.

### Test harness

`frontend/tests/render-helpers.tsx` currently wraps rendered UI in `QueryClientProvider` + `RouterProvider` and nothing else. Tests that exercise a flow ending in a toast need a `<Toaster />` mounted in the same tree.

Update:

```tsx
// frontend/tests/render-helpers.tsx
import { Toaster } from "@/components/ui/sonner";

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

This keeps the helper's signature unchanged. Tests that do not use `renderWithProviders` (the pure-UI ones that import `render` directly) do not gain a Toaster; they don't need one.

### Test additions

Two new test files plus one update:

1. **`frontend/src/components/ui/sonner.test.tsx`** (new). Three unit tests:
   - The wrapper renders with no props without throwing.
   - Firing `toast.success("hello")` renders the text in the document (via `findByText`).
   - Firing `toast.info("empty")` renders that text.
   This test file uses bare `render()` (no router, no query client, no theme provider). The sonner wrapper calls `useTheme()` from next-themes, which returns `theme: undefined` outside a provider; the wrapper's `?? "system"` fallback keeps rendering safe. No i18n pin is needed because the test passes literal strings, not `t()` keys.

2. **`frontend/tests/school-classes-page.test.tsx`** (update). The existing page tests already render `<SchoolClassesPage />` via `renderWithProviders`, so they will pick up the new `<Toaster />` automatically. Add two tests in a new `describe("Generate-lessons toast", ...)` block: one for `count > 0` (success toast, from the existing MSW handler that returns a single generated lesson) and one for `count === 0` (info toast, via an MSW override that returns `[]`). Both spy on `window.alert` and assert it is never invoked. The existing file pins locale to German, so the toast-copy assertions use the German strings from `de.json` (`"1 Stunde erzeugt"`, `"Kein neuer Unterricht erzeugt"`). Using the file's existing locale avoids cross-test state leaks from `i18n.changeLanguage`.

3. **`frontend/src/features/school-classes/generate-lessons-dialog.test.tsx`**. No change; this test asserts `onDone` was called with the count. The toast lives in the page-level consumer, not the dialog itself.

The new `sonner.test.tsx` needs no i18n pin because it asserts literal strings. The page test inherits its existing German locale pin.

### Dead dep removal

`@radix-ui/react-toast` is in `frontend/package.json` but has zero imports under `src/`. Remove with:

```sh
mise exec -- pnpm -C frontend remove @radix-ui/react-toast
```

Ships as a separate `chore(frontend): drop unused @radix-ui/react-toast` commit, to keep dep surgery out of the `feat` commit.

### i18n

Zero changes to `en.json` / `de.json`. The two strings the migrated call site uses already exist:

- `schoolClasses.generateLessons.created` (`"Created {{count}} lessons."` / `"Es wurden {{count}} Stunden erstellt."` or whatever currently lives there)
- `schoolClasses.generateLessons.noneCreated`

### Accessibility

- sonner renders its viewport with `role="region"` and each toast with `role="status"` (polite aria-live) for success / info. Matches the frontend CLAUDE.md rule "No dynamic content without `aria-live` for toasts".
- Colour-only signalling is avoided: sonner variants include an icon per level (`richColors`), so users who do not perceive the green / blue tint still see the icon.
- `closeButton` exposes a keyboard-accessible dismiss affordance.

## Ripple effect on coverage ratchet

- New lines: wrapper (~12 LoC) plus three unit tests plus one updated page test. All covered.
- Removed lines: the `window.alert` call (one line).
- Expected net impact: neutral to slightly positive on `total.lines.pct`. Baseline is currently 71%. If the ratchet drops below the baseline anyway (unlikely), run `mise run fe:cov:update-baseline` once and commit the new value.

## Implementation order

Three commits on the branch:

1. `feat(frontend): add shadcn sonner Toaster primitive`. Adds `src/components/ui/sonner.tsx`, mounts `<Toaster />` in `main.tsx`, adds the Toaster to `renderWithProviders`, and adds `sonner.test.tsx`. Installs `sonner` via `pnpm add`. Call site is not yet changed; `window.alert` still fires.
2. `refactor(frontend): use toast for Generate-lessons result`. Replaces `window.alert(...)` in `school-classes-page.tsx` with `toast.success` / `toast.info`. Adds the updated `school-classes-page.test.tsx` assertion. Removes the `window.alert` spy if one exists. No other functional changes.
3. `chore(frontend): drop unused @radix-ui/react-toast`. Removes the dep via pnpm. No other files change.

Splitting this way keeps the primitive addition, the behaviour-preserving call-site swap, and the dep surgery each in their own commit. The first commit is purely additive; the second is the only behavioural change (alert → toast), contained and minimal; the third is metadata-only.

## Risks

- **Coverage ratchet drop.** Low; see math above. Mitigated by the three new tests.
- **Test harness double-mount.** If a future page-level test already mounts its own Toaster (none do today), the updated `renderWithProviders` would produce two. Low-risk today, but call it out in the commit body so future readers know where the Toaster lives.
- **Theme desync.** Sonner reads the next-themes `theme` value. If `useTheme()` ever returns `undefined` during hydration, the fallback `?? "system"` in the wrapper keeps the Toaster rendering in system mode. Verified via the unit test.
- **Missing ref polyfills.** sonner uses standard DOM APIs; no pointer-event polyfills needed beyond what `tests/setup.ts` already patches.
- **Interpolation drift in de.json.** Removed alerts do not change the i18n calls, so German copy remains identical. Any mistranslation is pre-existing and out of scope.

## Follow-ups (not this PR)

- When the "Typed deletion errors for in-use entities" cross-entity pass lands, revisit whether 409-on-delete should surface as a toast instead of a form root error. The primitive will be available and the decision becomes a UX choice rather than an infra one.
- If a second, non-schoolClasses feature starts firing toasts, carve out a `toasts.*` i18n namespace in that pass.
- Optional: add a `<Toaster />` to the `AuthShell` / `/login` route test harness once login error toasts are introduced, so login-flow tests can assert them.
