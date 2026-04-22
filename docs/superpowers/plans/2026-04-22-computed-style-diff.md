# Computed-style diff across interaction states Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Playwright spec that crawls interactive elements on every authed route and `/login`, captures `getComputedStyle()` longhand values in base / `:hover` / `:focus` / `:active`, and fails if any structural property differs between states outside a narrow per-state allowlist.

**Architecture:** One new Playwright spec (`frontend/e2e/flows/computed-style-diff.spec.ts`) drives two support modules: a pure-logic helper (`frontend/e2e/support/style-diff-helpers.ts`) that is TDD-covered by Vitest, and a Playwright-aware helper (`frontend/e2e/support/style-diff.ts`) that wires the pure logic to `page` / `locator` state transitions. Drift is reported as a `Finding[]` attached to the test as `drift.json`; the test asserts the array is empty.

**Tech Stack:** TypeScript, Playwright (`@playwright/test`), Vitest for unit tests of pure helpers, shadcn/Tailwind classes on the app under test.

---

## File layout

- Create `frontend/e2e/support/style-diff-helpers.ts`: pure functions, zero Playwright imports.
- Create `frontend/tests/style-diff-helpers.test.ts`: Vitest unit tests for the pure helpers (lives under `frontend/tests/` because `frontend/e2e/**` is excluded from Vitest collection).
- Create `frontend/e2e/support/style-diff.ts`: Playwright-aware driver, constants, and the route list.
- Create `frontend/e2e/flows/computed-style-diff.spec.ts`: the Playwright spec itself.

No edits to existing files.

---

## Task 1: Pure helpers with Vitest TDD

**Files:**
- Create: `frontend/e2e/support/style-diff-helpers.ts`
- Test: `frontend/tests/style-diff-helpers.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Content for `frontend/tests/style-diff-helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeDiff,
  dedupeFindings,
  signatureOf,
  type Finding,
  type StateSnapshot,
} from "../e2e/support/style-diff-helpers";

describe("signatureOf", () => {
  it("joins tag and sorted deduplicated classes with dot delimiters", () => {
    expect(signatureOf("button", ["bg-primary", "px-4", "bg-primary", "rounded-md"])).toBe(
      "button.bg-primary.px-4.rounded-md",
    );
  });

  it("handles empty class list with a trailing dot so grouping is stable", () => {
    expect(signatureOf("a", [])).toBe("a.");
  });

  it("lowercases the tag name so DOM-reported uppercase tags do not split signatures", () => {
    expect(signatureOf("BUTTON", ["x"])).toBe("button.x");
  });

  it("treats whitespace tokens as separators after a caller passes a pre-split list", () => {
    // Callers split on whitespace; signatureOf itself does not re-split a token.
    expect(signatureOf("div", ["a b"])).toBe("div.a b");
  });
});

describe("computeDiff", () => {
  const base: StateSnapshot = {
    "padding-top": "4px",
    "padding-left": "8px",
    "outline-offset": "0px",
    width: "100px",
  };

  it("returns empty findings when a state matches base exactly", () => {
    const findings = computeDiff({
      route: "/x",
      signature: "button.a",
      tag: "button",
      classes: ["a"],
      state: "hover",
      base,
      stateSnapshot: base,
      allowlist: [],
    });
    expect(findings).toEqual([]);
  });

  it("emits one finding per property that differs from base", () => {
    const findings = computeDiff({
      route: "/x",
      signature: "button.a",
      tag: "button",
      classes: ["a"],
      state: "hover",
      base,
      stateSnapshot: { ...base, "padding-top": "6px", width: "102px" },
      allowlist: [],
    });
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.property).sort()).toEqual(["padding-top", "width"]);
  });

  it("suppresses findings for properties listed in the state allowlist", () => {
    const findings = computeDiff({
      route: "/x",
      signature: "button.a",
      tag: "button",
      classes: ["a"],
      state: "focus",
      base,
      stateSnapshot: { ...base, "outline-offset": "2px" },
      allowlist: ["outline-offset"],
    });
    expect(findings).toEqual([]);
  });

  it("keeps findings for properties not in the allowlist even when the allowlist is non-empty", () => {
    const findings = computeDiff({
      route: "/x",
      signature: "button.a",
      tag: "button",
      classes: ["a"],
      state: "focus",
      base,
      stateSnapshot: { ...base, "outline-offset": "2px", width: "120px" },
      allowlist: ["outline-offset"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.property).toBe("width");
  });

  it("records the base and state values verbatim in the finding", () => {
    const [finding] = computeDiff({
      route: "/x",
      signature: "button.a",
      tag: "button",
      classes: ["a"],
      state: "active",
      base,
      stateSnapshot: { ...base, width: "120px" },
      allowlist: [],
    });
    expect(finding?.base).toBe("100px");
    expect(finding?.stateValue).toBe("120px");
  });
});

describe("dedupeFindings", () => {
  const make = (signature: string, state: Finding["state"], property: string): Finding => ({
    route: "/x",
    signature,
    tag: "button",
    classes: [],
    state,
    property,
    base: "a",
    stateValue: "b",
  });

  it("returns one finding per (signature, state, property) triple", () => {
    const findings = [
      make("button.a", "hover", "width"),
      make("button.a", "hover", "width"),
      make("button.a", "focus", "width"),
    ];
    expect(dedupeFindings(findings)).toHaveLength(2);
  });

  it("preserves relative order of the first occurrence of each triple", () => {
    const findings = [
      make("button.a", "hover", "width"),
      make("button.b", "hover", "width"),
      make("button.a", "hover", "width"),
    ];
    const deduped = dedupeFindings(findings);
    expect(deduped.map((f) => f.signature)).toEqual(["button.a", "button.b"]);
  });
});
```

- [ ] **Step 1.2: Run the test and confirm it fails with module-not-found**

Run from `frontend/`:
```
mise exec -- pnpm vitest run tests/style-diff-helpers.test.ts
```
Expected: test run errors out importing `../e2e/support/style-diff-helpers` because the file does not exist yet.

- [ ] **Step 1.3: Create the pure helper module**

Content for `frontend/e2e/support/style-diff-helpers.ts`:

```ts
export type State = "hover" | "focus" | "active";

export type StateSnapshot = Record<string, string>;

export type Finding = {
  route: string;
  signature: string;
  tag: string;
  classes: readonly string[];
  state: State;
  property: string;
  base: string;
  stateValue: string;
};

export function signatureOf(tag: string, classes: readonly string[]): string {
  const unique = Array.from(new Set(classes)).sort();
  return `${tag.toLowerCase()}.${unique.join(".")}`;
}

export function computeDiff(args: {
  route: string;
  signature: string;
  tag: string;
  classes: readonly string[];
  state: State;
  base: StateSnapshot;
  stateSnapshot: StateSnapshot;
  allowlist: readonly string[];
}): Finding[] {
  const { route, signature, tag, classes, state, base, stateSnapshot, allowlist } = args;
  const allowed = new Set(allowlist);
  const findings: Finding[] = [];
  for (const property of Object.keys(base)) {
    if (allowed.has(property)) continue;
    const baseValue = base[property] ?? "";
    const stateValue = stateSnapshot[property] ?? "";
    if (baseValue !== stateValue) {
      findings.push({
        route,
        signature,
        tag,
        classes,
        state,
        property,
        base: baseValue,
        stateValue,
      });
    }
  }
  return findings;
}

export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];
  for (const finding of findings) {
    const key = `${finding.signature}::${finding.state}::${finding.property}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }
  return result;
}
```

- [ ] **Step 1.4: Run the test and confirm it passes**

Run:
```
cd frontend && mise exec -- pnpm vitest run tests/style-diff-helpers.test.ts
```
Expected: all 10 assertions pass (4 `signatureOf` + 5 `computeDiff` + 2 `dedupeFindings`; counts approximate, should be zero failures).

- [ ] **Step 1.5: Commit**

```
git add frontend/e2e/support/style-diff-helpers.ts frontend/tests/style-diff-helpers.test.ts
git commit -m "test(e2e): add pure helpers for computed-style diff"
```

Check the commit message is accepted by `cog`. If `cog` rejects, the scope `(e2e)` may need adjusting; acceptable alternative is `test: add pure helpers for computed-style diff`.

---

## Task 2: Playwright-aware driver

**Files:**
- Create: `frontend/e2e/support/style-diff.ts`

- [ ] **Step 2.1: Create the driver module**

Content for `frontend/e2e/support/style-diff.ts`:

```ts
import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  computeDiff,
  dedupeFindings,
  signatureOf,
  type Finding,
  type State,
  type StateSnapshot,
} from "./style-diff-helpers";

export const INTERACTIVE_SELECTOR = "button, a, [role=button], input, [tabindex]";

export const STRUCTURAL_PROPERTIES = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "width",
  "height",
  "transform",
  "outline-offset",
  "clip-path",
] as const;

export const STATE_ALLOWLIST: Record<State, readonly string[]> = {
  hover: [],
  focus: ["outline-offset"],
  active: [],
} as const;

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

type ElementDescriptor = {
  locator: Locator;
  tag: string;
  classes: string[];
  signature: string;
};

async function resetInteractionState(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

async function collectDescriptors(page: Page): Promise<ElementDescriptor[]> {
  const raw = await page.$$eval(INTERACTIVE_SELECTOR, (elements) =>
    elements.map((el, index) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const hidden =
        style.display === "none" ||
        style.visibility === "hidden" ||
        el.getAttribute("aria-hidden") === "true" ||
        rect.width === 0 ||
        rect.height === 0 ||
        (el as HTMLButtonElement).disabled === true;
      return {
        index,
        tag: el.tagName,
        classes: el.className ? el.className.trim().split(/\s+/) : [],
        hidden,
      };
    }),
  );

  const locators = page.locator(INTERACTIVE_SELECTOR);
  const descriptors: ElementDescriptor[] = [];
  for (const item of raw) {
    if (item.hidden) continue;
    descriptors.push({
      locator: locators.nth(item.index),
      tag: item.tag,
      classes: item.classes,
      signature: signatureOf(item.tag, item.classes),
    });
  }
  return descriptors;
}

async function snapshot(locator: Locator, properties: readonly string[]): Promise<StateSnapshot> {
  return locator.evaluate((el, props) => {
    const style = window.getComputedStyle(el);
    const out: Record<string, string> = {};
    for (const prop of props) out[prop] = style.getPropertyValue(prop);
    return out;
  }, properties);
}

async function captureStates(
  page: Page,
  descriptor: ElementDescriptor,
): Promise<{ base: StateSnapshot; hover: StateSnapshot; focus: StateSnapshot; active: StateSnapshot }> {
  await resetInteractionState(page);
  const base = await snapshot(descriptor.locator, STRUCTURAL_PROPERTIES);

  await descriptor.locator.hover({ timeout: 2_000, trial: false });
  const hover = await snapshot(descriptor.locator, STRUCTURAL_PROPERTIES);

  await resetInteractionState(page);
  await descriptor.locator.focus({ timeout: 2_000 });
  const focus = await snapshot(descriptor.locator, STRUCTURAL_PROPERTIES);

  await resetInteractionState(page);
  await descriptor.locator.hover({ timeout: 2_000 });
  await page.mouse.down();
  const active = await snapshot(descriptor.locator, STRUCTURAL_PROPERTIES);
  await page.mouse.up();

  await resetInteractionState(page);
  return { base, hover, focus, active };
}

export async function collectStyleDrift(
  page: Page,
  route: string,
  _testInfo: TestInfo,
): Promise<Finding[]> {
  await page.goto(route);
  await page.waitForLoadState("networkidle");

  const descriptors = await collectDescriptors(page);
  const seenSignatures = new Set<string>();
  const findings: Finding[] = [];

  for (const descriptor of descriptors) {
    if (seenSignatures.has(descriptor.signature)) continue;
    seenSignatures.add(descriptor.signature);

    let states: Awaited<ReturnType<typeof captureStates>>;
    try {
      states = await captureStates(page, descriptor);
    } catch {
      continue;
    }

    for (const state of ["hover", "focus", "active"] as const) {
      findings.push(
        ...computeDiff({
          route,
          signature: descriptor.signature,
          tag: descriptor.tag.toLowerCase(),
          classes: descriptor.classes,
          state,
          base: states.base,
          stateSnapshot: states[state],
          allowlist: STATE_ALLOWLIST[state],
        }),
      );
    }
  }

  return dedupeFindings(findings);
}

export type { Finding } from "./style-diff-helpers";
```

- [ ] **Step 2.2: Type-check the driver**

Run from repo root:
```
cd frontend && mise exec -- pnpm exec tsc --noEmit
```
Expected: no errors. (Playwright types must resolve; if `fe:build` has not run since cloning, run `mise run fe:build` first to regenerate `routeTree.gen.ts`.)

- [ ] **Step 2.3: Commit**

```
git add frontend/e2e/support/style-diff.ts
git commit -m "test(e2e): add playwright driver for computed-style diff"
```

---

## Task 3: Playwright spec

**Files:**
- Create: `frontend/e2e/flows/computed-style-diff.spec.ts`

- [ ] **Step 3.1: Create the spec**

Content for `frontend/e2e/flows/computed-style-diff.spec.ts`:

```ts
import { expect, test } from "../fixtures/test";
import {
  ROUTES_UNDER_TEST,
  collectStyleDrift,
  type Finding,
} from "../support/style-diff";

test("no structural style drift across interaction states", async ({ page }, testInfo) => {
  const findings: Finding[] = [];
  for (const route of ROUTES_UNDER_TEST) {
    findings.push(...(await collectStyleDrift(page, route, testInfo)));
  }

  await testInfo.attach("drift.json", {
    body: Buffer.from(JSON.stringify(findings, null, 2), "utf8"),
    contentType: "application/json",
  });

  expect(findings, describeFindings(findings)).toEqual([]);
});

function describeFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return "no drift";
  const byRoute = new Map<string, number>();
  for (const f of findings) byRoute.set(f.route, (byRoute.get(f.route) ?? 0) + 1);
  const summary = Array.from(byRoute.entries())
    .map(([route, count]) => `${route}=${count}`)
    .join(", ");
  return `${findings.length} structural drift findings (${summary}); see drift.json attachment`;
}
```

- [ ] **Step 3.2: Run the spec locally against a running dev server**

Ensure the database is up (`mise run db:up`) and the webServer config in `frontend/e2e/playwright.config.ts` orchestrates `vite preview` + the backend. Run from repo root:

```
mise run fe:e2e
```

Expected: three specs pass (`smoke`, `subjects`, `computed-style-diff`). If `computed-style-diff` fails with legitimate drift findings, open `frontend/playwright-report/index.html`, click the failing test, inspect the `drift.json` attachment.

- [ ] **Step 3.3: If real drift is found, triage**

For each unique `(signature, state, property)` triple in `drift.json`:

- If the drift represents an intentional visual-change pattern (hover lift via `margin-top`, deliberate `padding` growth on `:active`), extend `STATE_ALLOWLIST` in `style-diff.ts` with the narrowest entry that covers it. Explain the entry with a line comment pointing at the component. Commit as `test(e2e): allowlist intentional <property> change on <state>`.
- If the drift is a real bug (hover shape drifted from base), fix the responsible component in a preceding commit typed `fix(frontend): ...`. The behavioural `test(e2e):` commit lands after the fix.

Re-run `mise run fe:e2e` until the spec passes.

- [ ] **Step 3.4: Commit the spec**

```
git add frontend/e2e/flows/computed-style-diff.spec.ts
git commit -m "test(e2e): add computed-style diff across interaction states"
```

---

## Task 4: Verify the whole test suite still passes

- [ ] **Step 4.1: Run full lint and test**

```
mise run lint
mise run fe:test
mise run fe:e2e
```

Expected: every task passes. `lint` catches Biome / tsc issues introduced by the new files; `fe:test` runs Vitest over the helpers unit tests; `fe:e2e` runs the full Playwright suite including the new spec.

- [ ] **Step 4.2: Confirm the Playwright report attaches `drift.json`**

Open `frontend/playwright-report/index.html` and verify the `computed-style-diff` spec has a `drift.json` attachment containing `[]` (since the assertion passed).

---

## Self-review checklist

- **Spec coverage:** every spec requirement (selector, property list, state allowlist, per-route dedupe by signature, drift attachment, no new task / no new project, tidy-first commit order) maps to Task 1, Task 2, or Task 3.
- **No placeholders:** every code block above is complete and copy-runnable.
- **Type consistency:** `State`, `StateSnapshot`, `Finding` referenced in Task 2 match the definitions in Task 1. `signatureOf`, `computeDiff`, `dedupeFindings` signatures are consistent across both files. `STATE_ALLOWLIST` in Task 2 covers only the three non-base states, matching `Finding.state`'s union.
- **Commit hygiene:** four commits planned (Task 1 helpers, Task 2 driver, Task 3 spec, optional Task 3 allowlist if drift surfaces). All Conventional-Commits typed. No structural + behavioural mixing.
