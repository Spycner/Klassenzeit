# `useEffect` derived-state sync lint rule

**Date:** 2026-04-25
**Status:** Design approved (autopilot autonomous mode), plan pending.

## Problem

`frontend/CLAUDE.md`'s "Hooks and state" section forbids `useEffect` for derived state:

> No `useEffect` for derived state. Compute during render. For syncing to props, use `key` to remount or derive inline.

> `useEffect` mount gate is acceptable only for third-party sync (e.g. `next-themes`); flag it in review for anything else.

Three call sites in the current tree violate this rule with the same shape:

- `frontend/src/features/rooms/room-availability-grid.tsx:20` — `useEffect(() => setSelected(persisted), [persisted]);`
- `frontend/src/features/teachers/teacher-availability-grid.tsx:46` — `useEffect(() => setStatuses(persisted), [persisted]);`
- `frontend/src/features/teachers/teacher-qualifications-editor.tsx:14-16` — block-body variant of the same pattern.

`docs/superpowers/OPEN_THINGS.md`'s active sprint > tidy phase > item 4 names the deferral and undercounts it as two violations. The third site (`room-availability-grid.tsx`) shares the same shape and gets folded into this PR.

The rule currently relies on review discipline. Two legitimate `useEffect` call sites exist and must keep working: `frontend/src/components/ui/sonner.tsx` (third-party document-listener wiring with cleanup) and `frontend/src/components/theme-toggle.tsx` (mount gate for `next-themes`). Both use empty dep arrays; the documented anti-pattern is specifically about non-empty deps that shape the body's `setX(...)` argument.

The "draft pattern" in the three editors also masks a real bug: a background refetch of the underlying detail query (e.g. after a save mutation invalidates) re-fires the `useEffect` and wipes any in-progress edits. Removing the `useEffect` and switching to a lazy `useState` initializer fixes the bug as a side effect of the structural change.

`docs/superpowers/OPEN_THINGS.md` lists three options for the lint mechanism:

> Write a Biome plugin, `eslint-plugin-react-hooks` rule, or a bespoke `scripts/check_use_effect_sync.ts` that flags `useEffect` bodies that are pure `setState(f(dep))`; fix the two existing violations in the same PR so the lint can run with `-D`.

## Goal

Land four commits on branch `chore/use-effect-sync-lint`:

1. **Refactor.** Lift detail-fetch out of the three editor components so the local draft state is initialized once via a lazy `useState` callback, never re-synced from props. Existing component tests pass without modification.
2. **Tests.** Add three Vitest specs (one per editor) asserting that a background refetch does not wipe in-progress edits.
3. **Lint script.** New `scripts/check_use_effect_sync.py` modeled on `scripts/check_unique_fns.py`, plus its pytest fixtures, wired into `mise.toml`'s `lint:py` task. Pre-commit and CI both pick it up.
4. **Docs.** Short note in `frontend/CLAUDE.md`'s "Hooks and state" section that the rule is now enforced by `mise run lint`.

## Non-goals

- **Adding ESLint to the repo.** The `eslint-plugin-react-hooks` option in OPEN_THINGS would solve the rule cleanly but doubles the lint pipeline's surface area. Out of scope for one rule. Revisit only if a basket of similar React-specific rules accumulates.
- **A Biome GritQL plugin.** Native to the existing linter and would surface in the IDE, but pays a learning-curve and plugin-test cost that does not amortize over one rule. Reconsider when a second frontend-specific lint rule appears.
- **Generalizing to all `useEffect` shapes.** The script flags exactly the documented anti-pattern: a `useEffect` whose arrow body is a single `setX(...)` call (expression body or single-statement block body) with a non-empty deps array. Multi-statement bodies, useReducer dispatch, and effect-with-cleanup forms are out of scope. Document the narrowing in the script's docstring so a future widening has a clear extension point.
- **Architectural rework of the editors.** The three editors stay self-contained. Lifting the entire draft state to the parent dialog or moving to a TanStack-Query optimistic-cache approach is a separate question and out of scope for a tidy PR.
- **ADR.** No new toolchain, no architectural decision. The rule mechanism (a Python regex script) is consistent with the existing `check_unique_fns.py` precedent.
- **Touching `mise run fe:lint` (Biome).** The new script runs under `lint:py`. Biome's config does not change.

## Design

### Lint script

New file `scripts/check_use_effect_sync.py`. Walks `frontend/src/**/*.{ts,tsx}` (excluding generated files: `routeTree.gen.ts`, `lib/api-types.ts`). Uses regex on lightly-normalized source to flag `useEffect(...)` calls matching:

- Arrow expression body: `useEffect(() => setX(args), [deps])` with non-empty `[deps]` and `setX` matching `^set[A-Z][A-Za-z0-9_]*$`.
- Arrow block body, single statement: `useEffect(() => { setX(args); }, [deps])` with non-empty `[deps]` and the same identifier shape.

Empty dep arrays (`[]`) are skipped explicitly so the next-themes mount gate and the sonner document listener are not flagged. Multi-statement bodies are not flagged in this iteration.

Walk order:

1. Iterate `.ts` / `.tsx` files under `frontend/src/`.
2. For each file, normalize whitespace inside `useEffect(...)` calls (collapse runs of spaces and newlines to single spaces) so the regex matches the canonical multi-line layout that Biome's formatter produces.
3. Match the two regex variants. Collect `(file, line, matched_call)` for each hit.
4. Print one line per violation in the standard `path:line: message` format consumed by editor tooling, then exit non-zero if any violations exist.
5. Exit 0 if clean.

The matcher is pure regex on a single normalized source string; no AST library, no subprocess. The script's docstring captures the narrowing decisions so a contributor extending it has a clear starting point.

### Lint pipeline wiring

`mise.toml`'s `lint:py` task gains one line:

```toml
[tasks."lint:py"]
description = "Lint, format-check, type-check, dead-code scan Python, plus cross-language lint scripts"
run = [
  "uv run ruff check",
  "uv run ruff format --check",
  "uv run ty check",
  "uv run vulture backend/src",
  "uv run python scripts/check_unique_fns.py",
  "uv run python scripts/check_use_effect_sync.py",
]
```

Description tweak captures that the task already mixes Python lint with cross-language scripts. No new task created.

### Lint script tests

New file `scripts/tests/test_check_use_effect_sync.py` mirroring `scripts/tests/test_check_unique_fns.py`'s structure. Each test passes a string snippet to the matcher and asserts the violation list. Coverage:

- Positive: arrow expression body, single-line.
- Positive: arrow expression body, multi-line (deps on its own line).
- Positive: arrow block body, single statement.
- Positive: arrow block body, single statement with semicolon, multi-line.
- Negative: empty deps, expression body (`useEffect(() => setMounted(true), [])`).
- Negative: empty deps, block body with cleanup (the sonner shape).
- Negative: non-empty deps, multi-statement body (intentional out-of-scope shape; documents the narrowing).
- Negative: non-empty deps, body that calls `setupSomething(value)` (lowercase second char, not a setter).
- Negative: a function declared `function setX(...)` that contains the literal string `useEffect(...)` inside a comment (string-literal-not-call check).

The test fixtures live as raw Python strings inside the test file. No temp files needed.

### Editor refactor

All three editors take the same outer/inner shape:

```tsx
export function RoomAvailabilityGrid({ roomId }: { roomId: string }) {
  const detail = useRoomDetail(roomId);
  if (!detail.isSuccess) return null;
  return <RoomAvailabilityGridLoaded room={detail.data} />;
}

function RoomAvailabilityGridLoaded({ room }: { room: RoomDetail }) {
  const persisted = useMemo(
    () => new Set(room.availability.map((a) => a.time_block_id)),
    [room.availability],
  );
  const [selected, setSelected] = useState<Set<string>>(() => persisted);
  // ... rest of the component, unchanged
}
```

Critical constraints on the inner component:

- The lazy `useState` initializer reads from props and runs once on mount. Subsequent prop changes do NOT update local state (no `useEffect`).
- `persisted` stays `useMemo`'d if the inner body still consumes it for downstream comparisons; otherwise drop it.
- `useEffect` import is removed from each file when it is the only effect being deleted. Eight `useEffect` references exist across the tree; only the three derived-state ones are touched.

The outer component continues to call the existing detail hook (`useRoomDetail`, `useTeacherDetail`). The inner component receives a fully-loaded entity. React Query dedupes the underlying fetch even though the hook is invoked in two places (parent dialog and inner editor); calling it once in the outer wrapper is enough.

The early return `if (!detail.isSuccess) return null;` matches the existing UX where the editor showed an empty grid during loading. A small skeleton (`<p className="text-sm text-muted-foreground">{t("common.loading")}</p>`) is a follow-up and does not block this PR.

### Refetch-preserves-edits tests

Three new specs colocated next to each editor:

- `frontend/src/features/rooms/room-availability-grid.test.tsx` — second `it("preserves in-progress edits during a background refetch")`.
- `frontend/src/features/teachers/teacher-availability-grid.test.tsx` — same.
- `frontend/src/features/teachers/teacher-qualifications-editor.test.tsx` — same.

Each spec:

1. Seeds the relevant MSW table (e.g. `roomAvailabilityByRoomId[roomId] = []`) and renders the editor.
2. Waits for the grid to render via `findByRole`.
3. Toggles one cell or adds one qualification.
4. Mutates the MSW seed in place to simulate a sibling-tab change.
5. Calls `queryClient.invalidateQueries({ queryKey: [...] })` to trigger a refetch.
6. Waits one tick (`await vi.waitFor(...)` against the new MSW response).
7. Asserts the user's edit is still in the DOM (e.g. the toggled cell still shows `aria-pressed="true"`).

`renderWithProviders` already returns a QueryClient handle today (or can be extended in this PR if it does not); pick the simpler route when writing the test.

### Docs change

One bullet under `frontend/CLAUDE.md`'s "Hooks and state" section:

```md
- **No `useEffect` for derived state.** Compute during render. For syncing to props, use `key` to remount or derive inline. Enforced by `mise run lint` via `scripts/check_use_effect_sync.py`.
```

The "flag in review" mount-gate bullet stays as-is; mount gates are not what the script catches.

`OPEN_THINGS.md` gets two edits in the same docs commit:

- Tidy-phase item 4 marked shipped with the date and PR link.
- A small follow-up entry: "widen `check_use_effect_sync.py` to multi-statement effect bodies" (in the "Acknowledged deferrals" section), as the OPEN_THINGS narrowing documented in this spec.

### Behavior preservation

The refactor's structural change must keep the existing component specs passing without modification. The three editors today render an empty grid before data loads (because `persisted` is empty before the fetch resolves) and a populated grid after. After the refactor:

- Outer returns `null` while loading (was: empty grid).
- Inner mounts on `detail.isSuccess` with `persisted` already seeded.

Tests already use `findByRole` with async waits, so they wait for the populated grid either way. The existing test for `teacher-availability-grid.test.tsx` calls `findAllByRole("button", { name: /^preferred/i })` after MSW seeding; both pre- and post-refactor pass because the buttons appear once data loads.

The mutation flow (toggle → save → success → invalidate → refetch) is unchanged. Save still hits the same mutation, query still invalidates, refetch still completes. The visible difference is that the user's local draft is preserved through the refetch (previously wiped). The new specs lock that property in.

## Implementation order

Branch: `chore/use-effect-sync-lint`. Four commits.

1. `refactor(frontend): lift detail-fetch out of three draft editors` — outer/inner split for `RoomAvailabilityGrid`, `TeacherAvailabilityGrid`, `TeacherQualificationsEditor`. Three `useEffect` derived-state syncs deleted. Existing tests pass unchanged.
2. `test(frontend): assert refetch preserves in-progress edits` — three new Vitest specs (one per editor) locking in the property the refactor delivers.
3. `chore(scripts): add check_use_effect_sync.py and wire into lint:py` — new Python script, pytest fixtures, one-line `mise.toml` addition, description tweak.
4. `docs(frontend): note useEffect derived-state lint enforcement` — one-bullet edit in `frontend/CLAUDE.md`, OPEN_THINGS cleanup, follow-up note.

Pre-push runs the full test suite and lint; each commit must leave master green. Commit 3 is the gating commit for the rule itself; if anything in commit 1 missed a violation, commit 3's run fails and the violation is fixed before pushing.

## Risks

- **Regex false positives.** A `useEffect(() => setupX(value), [value])` style call where the function happens to start with `set` followed by an uppercase letter, but is not a state setter. The matcher constraint (`^set[A-Z][A-Za-z0-9_]*$`) maps to React's setter naming convention; `setupSomething` (lowercase second char) is excluded. Tests cover the boundary. If a real false positive lands, the script's docstring documents how to widen the negative-case fixture.
- **Regex false negatives from formatting.** A `useEffect` whose body spans more lines than the matcher's normalization handles. Mitigation: collapse whitespace inside the call before matching, plus one positive test for each known formatting variant. Tests on the existing tree pin the canonical layout Biome's formatter produces.
- **Coverage ratchet trip.** Removing `useEffect` lines + adding lazy initializers + new wrapper components shifts the line counts. Net effect is roughly neutral, but the ratchet may move within the noise band. If `mise run fe:test:cov` drops below baseline, rebaseline once via `mise run fe:cov:update-baseline` in commit 2.
- **`renderWithProviders` does not expose the QueryClient.** If extending it is awkward, fall back to a per-test wrapper that mounts `QueryClientProvider` explicitly and exposes the client for invalidation. Existing precedent in `frontend/src/features/rooms/rooms-dialogs.test.tsx`'s `wrapRoomDialog`.
- **Pre-commit catches the new lint immediately.** This is intentional. Order of commits 1 → 3 prevents the script from running against any unrefactored editor.

## Follow-ups (not this PR)

- **Multi-statement effect bodies.** The matcher currently flags only single-statement bodies. If a future violation slips in with `useEffect(() => { setA(x); setB(y); }, [x, y])`, widen the matcher and add the corresponding test fixture.
- **Loading skeleton in the three editors.** Outer wrapper today returns `null`; a small `<Skeleton/>` matching the grid shape is a UX polish item filed under OPEN_THINGS' product-capabilities section.
- **Biome GritQL plugin migration.** If a basket of frontend-specific lint rules accumulates (3+), revisit the option of porting the regex script to a GritQL plugin so violations surface in the IDE.
- **`renderWithProviders` returns the QueryClient.** Generally useful beyond this PR. File as a follow-up if not done in commit 2.
