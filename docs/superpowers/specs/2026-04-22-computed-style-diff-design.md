# Computed-style diff across interaction states

**Date:** 2026-04-22
**Status:** Design approved (autopilot, autonomous mode), plan pending.

## Problem

The Klassenzeit frontend uses shadcn primitives heavily, with Tailwind utility classes composed into variant sets. When those variants drift, the failure mode is subtle: a button's hover state grows by 2px because `px-4` on the base collides with a `px-6` on `:hover`, or a card's border-radius changes shape when focused because `rounded-md` and `focus:rounded-lg` both exist in the class list. Vitest component tests cannot see this (they query by role and text, never by layout), and the existing Playwright smoke / CRUD tests only exercise flows, not visual shape.

`docs/superpowers/OPEN_THINGS.md` → Testing → E2E → Visual regression catalogues three approaches and picks approach 2 for first landing because it is deterministic, cheap, and catches a specific, frequent bug class:

> **Computed-style diff across interaction states.** Crawl interactive elements (`button, a, [role=button], input, [tabindex]`) on each route, capture `getComputedStyle()` in base / `:hover` / `:focus` / `:active`, flag structural deltas (`border-radius`, `width`, `height`, `padding`, `margin`, `transform`, `outline-offset`, `clip-path`) between states. Dedupe by DOM class signature so shadcn variants collapse to one finding. Deterministic and cheap: fixed rule set of ~10 properties, runs per route not per component, catches the "hover shape drifted from base shape" class of bug.

The other two approaches (pixel-diff SaaS, vision-LLM) stay in OPEN_THINGS as follow-ups.

## Goal

Add a single Playwright spec that, for every authed route plus `/login`, crawls interactive elements, captures computed style longhands across base / `:hover` / `:focus` / `:active`, dedupes findings by a `<tag>.<sorted classes>` signature, and asserts that no element's *shape* changes across states except for the one allowlisted pair `{:focus → outline-offset}`. Failures attach a structured `drift.json` to the Playwright test report so triage is one click, not a log scroll.

## Non-goals

- **Comparing against a persistent visual baseline.** The delta is within a single run, across states of the same element. No checked-in snapshot files, no pixel diffing. Pixel-diff SaaS stays listed as approach 1 in OPEN_THINGS for later consideration.
- **Vision-LLM second pass.** Approach 3 is explicitly deferred.
- **New Playwright project or opt-in task.** The spec runs as part of the default e2e project, alongside the existing `smoke.spec.ts` and `subjects.spec.ts`. If the test turns out to dominate e2e job time we re-split later.
- **Wider interactive selector.** No `select`, `textarea`, `[role=menuitem]`, or `[role=option]` in v1; the OPEN_THINGS selector list is authoritative.
- **Wider property set.** Colors, shadows, fonts stay out. Hover is supposed to change colors.
- **More states.** No `:focus-visible`, no `:visited`, no `@media (prefers-reduced-motion)` toggles.
- **CDP-based state forcing.** Real Playwright interaction events first; `Emulation.forceElementState` stays a future optimisation.
- **Opening dialogs / dropdowns / menus to crawl their contents.** Radix doesn't mount overlay content until the trigger fires; v1 surveys what is statically rendered per route.
- **Allowlisting deltas via environment variables** (`SKIP_FAIL=1`, `-g exclude`, etc.). Expected deltas are hardcoded in `STATE_ALLOWLIST` and reviewed in-PR.

## Design

### Three commits, doc-first split

1. `docs: add computed style diff design spec` (this file).
2. `docs: add computed style diff implementation plan`.
3. `test(e2e): add computed-style diff across interaction states`, the behavioural commit carrying everything else.

No structural-only commit precedes the behavioural one because the test is net-additive: a new spec file, a new support module, no edits to existing Playwright code. The only non-spec edit is an import-style pattern match to `support/urls.ts`, which is additive.

### File layout

```
frontend/e2e/
├── flows/
│   ├── computed-style-diff.spec.ts   (new)
│   ├── smoke.spec.ts                 (unchanged)
│   └── subjects.spec.ts              (unchanged)
└── support/
    ├── style-diff.ts                 (new)
    └── urls.ts                       (unchanged)
```

`support/style-diff.ts` exports helpers and constants; `flows/computed-style-diff.spec.ts` is a thin driver that iterates routes.

### Module contract: `support/style-diff.ts`

Exports the following constants and functions. Types are sketched in the implementation plan; this section states the contract.

**`INTERACTIVE_SELECTOR`** (const, string):
```
'button, a, [role=button], input, [tabindex]'
```
Matches the OPEN_THINGS entry verbatim.

**`STRUCTURAL_PROPERTIES`** (const, string array): the longhand property names captured per element per state. Populated with the CSS properties `getComputedStyle()` actually returns. Because longhands are what the resolved style exposes, shorthands from OPEN_THINGS are expanded:

- `border-top-left-radius`, `border-top-right-radius`, `border-bottom-right-radius`, `border-bottom-left-radius`
- `padding-top`, `padding-right`, `padding-bottom`, `padding-left`
- `margin-top`, `margin-right`, `margin-bottom`, `margin-left`
- `border-top-width`, `border-right-width`, `border-bottom-width`, `border-left-width`
- `width`, `height`
- `transform`
- `outline-offset`
- `clip-path`

`border-width` is included because shadcn's `border-2 hover:border-4` would otherwise be invisible to us even though it changes perceived box size.

**`STATES`** (const, ordered tuple): `["base", "hover", "focus", "active"]`. Order is the order in which we apply actions; helpers pop the previous state before applying the next so states don't stack.

**`STATE_ALLOWLIST`** (const, record keyed by state name): map from state to the set of `STRUCTURAL_PROPERTIES` allowed to differ from `base`. Seeded with:

```ts
const STATE_ALLOWLIST: Record<State, readonly string[]> = {
  base: [],
  hover: [],
  focus: ["outline-offset"],
  active: [],
} as const;
```

Any other difference between a non-base state and the base state is a finding.

**`signatureOf(tag, classList)`** → `string`:
Deterministic identifier used for per-route dedupe. Produces `<tagName>.<sorted-dedup-class-tokens>`. Classes are split on whitespace, `Set`-deduped, sorted lexicographically, rejoined with `.`. A buttonless element (class list empty) produces `<tagName>.` so dedupe still groups.

**`collectStyleDrift(page, routePath, testInfo)`** → `Promise<Finding[]>`:
High-level driver that `page.goto(routePath)`, waits for the page to settle (via Playwright's network-idle heuristic or an explicit "main content visible" wait already used in subjects.spec.ts, whichever matches what's already used), finds interactive handles, iterates states, captures computed styles, and returns `Finding[]` deduped by signature.

**`Finding`** (type):
```ts
type Finding = {
  route: string;
  signature: string;
  tag: string;
  classes: readonly string[];
  state: "hover" | "focus" | "active";
  property: string;
  base: string;
  stateValue: string;
};
```

One finding = one (signature, state, property) triple that differs from base outside the allowlist.

### Spec contract: `flows/computed-style-diff.spec.ts`

```
import { expect, test } from "../fixtures/test";
import { ROUTES_UNDER_TEST, collectStyleDrift } from "../support/style-diff";

test("no structural style drift across interaction states", async ({ page }, testInfo) => {
  const findings = [];
  for (const route of ROUTES_UNDER_TEST) {
    findings.push(...(await collectStyleDrift(page, route, testInfo)));
  }
  await testInfo.attach("drift.json", {
    body: Buffer.from(JSON.stringify(findings, null, 2), "utf8"),
    contentType: "application/json",
  });
  expect.soft(findings).toEqual([]);
});
```

A single test; no `test.describe` ceremony. `expect.soft` ensures the attach always happens before the assertion fails (not strictly required since the attach precedes the expect, but conservative).

**`ROUTES_UNDER_TEST`** is seeded with every route file under `frontend/src/routes/`:

```ts
export const ROUTES_UNDER_TEST = [
  "/",
  "/lessons",
  "/rooms",
  "/school-classes",
  "/stundentafeln",
  "/subjects",
  "/teachers",
  "/week-schemes",
  "/login",
] as const;
```

The `/login` route is reachable without the admin storage-state; we still navigate to it while the admin session is active, which causes a redirect to `/` per the app's auth gate. Revisit in follow-up if we need pre-auth coverage (requires a second test with `storageState: undefined`).

### State driver

For each interactive element on a route, produce four snapshots of the structural properties:

1. **base:** `page.mouse.move(0, 0)` (pull pointer away), `document.activeElement.blur()` (clear focus), snapshot.
2. **hover:** `locator.hover()`, snapshot.
3. **focus:** `locator.focus()`, snapshot.
4. **active:** `locator.hover()`, `page.mouse.down()`, snapshot, `page.mouse.up()`.

Between elements, reset: move pointer to `(0, 0)` and blur. Snapshot uses a single `locator.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, s.getPropertyValue(p)])); }, STRUCTURAL_PROPERTIES)`.

### Dedupe

Per-route: build a `Map<signature, Finding[]>` as findings stream in. For each signature, keep the *first* finding per `(state, property)` pair. Emits at most `signatures × states × properties` findings per route, which in practice means two or three lines per regressed signature. Cross-route dedupe is deliberately not done: the same signature might drift on one route and not another because of cascading classes, and we want both findings visible.

### What the helpers deliberately do NOT do

- **No handling of elements added to the DOM mid-interaction.** If hovering a button causes a tooltip to mount, we don't rediscover elements; the initial crawl list is frozen. Tooltips are out-of-scope.
- **No scrolling.** Elements below the fold still exist in the layout tree and return valid computed styles; there is no visibility gate beyond `display/visibility`.
- **No class-name regex matching for Tailwind arbitrary values.** The signature is the raw class list, sorted. An arbitrary `[padding:5px]` is just another token.
- **No "expected-shape" diffs across components.** Two visually-identical buttons with different signatures won't be compared; only within-signature, across-state.

### Test plan

1. `mise run fe:e2e` on master (pre-change) → passes. This is the pre-condition.
2. After adding the spec, `mise run fe:e2e` → should still pass if no drift exists in any current shadcn variant.
3. Local sanity check: temporarily edit `frontend/src/components/ui/button.tsx` to add `hover:px-6` to the default variant, re-run, observe a failing spec with a finding pointing at `button.<sorted-classes>`. Revert.
4. Open the HTML Playwright report locally (`frontend/playwright-report/index.html`) and confirm `drift.json` is attached to the test result.
5. CI e2e job passes.

The step-3 sanity check is local-only and not committed.

### Risks and mitigations

- **Flaky focus-state captures.** `locator.focus()` can blur synchronously if the element is inside a closed dialog. Mitigation: the crawl is limited to visible, enabled, non-`aria-hidden` elements; Radix dialogs aren't in the DOM until opened, so this does not arise on route-level crawls. If it does, we skip the element and record a `skipped: true` line in the attachment rather than crash.
- **Performance.** Each state switch is a CDP round trip. Worst case at current route count: ~50 interactive elements per route × 4 states × 20ms ≈ 4s per route × 9 routes ≈ 40s. The current e2e job is ~1 minute; adding ~40s is acceptable. If it exceeds 2 minutes we split into a separate Playwright project or switch to CDP `forceElementState` in a follow-up.
- **Class-order instability.** Tailwind's preflight sorts classes but user-added classes may be emitted in component-author order. `signatureOf` sorts before joining, so the signature is stable.
- **False positives from scrollbar width changes.** Hovering a large element could trigger a momentary layout shift if overflow changes. Mitigation: run with `page.setViewportSize` matching the default e2e viewport (already configured); `getComputedStyle` resolves values post-layout so any shift settles before our snapshot.
- **Over-eager state allowlist.** `STATE_ALLOWLIST[":focus"]` = `["outline-offset"]` is a deliberately narrow concession. If a future design legitimately changes shape on hover (e.g., card lift by `margin-top`), we either extend the allowlist with a narrow entry (`hover: ["margin-top"]`) or carve a per-signature exception (not implemented in v1; revisit when we have a concrete case).

### Rollout

No migration, no feature flag. The spec runs in CI on the PR that introduces it. If it finds real drift in current master, the diagnosis belongs to that PR: either fix the drift in the same PR (tidy-first, same-branch) with a typed commit preceding the test commit, or file a targeted follow-up in OPEN_THINGS and temporarily allowlist the finding with a comment pointing at the follow-up.

### Follow-ups (not in this spec)

- Expand the interactive selector once the first run is proven clean.
- Switch to CDP `Emulation.forceElementState` for speed.
- Crawl overlay content (open each dialog and re-crawl).
- Promote approach 3 (vision-LLM diff) when approach 2 stops catching drift.

## Open questions

None; every decision above is explicit. If review surfaces one the answer lands as an `OPEN_THINGS` entry or a revision to this spec.
