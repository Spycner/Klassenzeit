import type { Locator, Page } from "@playwright/test";
import {
  computeDiff,
  dedupeFindings,
  type Finding,
  type State,
  type StateSnapshot,
  signatureOf,
} from "./style-diff-helpers";

// Budget per hover/focus attempt. Tighter than Playwright's default 30s so a
// non-interactable element fails fast and the crawl can skip it.
const INTERACTION_TIMEOUT_MS = 2_000;

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
        ((el instanceof HTMLButtonElement || el instanceof HTMLInputElement) && el.disabled);
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

async function snapshotStyle(
  locator: Locator,
  properties: readonly string[],
): Promise<StateSnapshot> {
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
): Promise<{
  base: StateSnapshot;
  hover: StateSnapshot;
  focus: StateSnapshot;
  active: StateSnapshot;
}> {
  await resetInteractionState(page);
  const base = await snapshotStyle(descriptor.locator, STRUCTURAL_PROPERTIES);

  await descriptor.locator.hover({ timeout: INTERACTION_TIMEOUT_MS });
  const hover = await snapshotStyle(descriptor.locator, STRUCTURAL_PROPERTIES);

  await resetInteractionState(page);
  await descriptor.locator.focus({ timeout: INTERACTION_TIMEOUT_MS });
  const focus = await snapshotStyle(descriptor.locator, STRUCTURAL_PROPERTIES);

  await resetInteractionState(page);
  await descriptor.locator.hover({ timeout: INTERACTION_TIMEOUT_MS });
  await page.mouse.down();
  const active = await snapshotStyle(descriptor.locator, STRUCTURAL_PROPERTIES);
  // Move the pointer off the element before releasing so the browser does not
  // fire a click event. Snapshotting :active would otherwise trigger navigation
  // (anchors), form submission (buttons inside a form), or destructive handlers
  // like logout, and break subsequent tests that share this browser context.
  await page.mouse.move(0, 0);
  await page.mouse.up();

  await resetInteractionState(page);
  return { base, hover, focus, active };
}

export async function collectStyleDrift(page: Page, route: string): Promise<Finding[]> {
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
    } catch (err) {
      // Elements that Playwright cannot hover/focus within the interaction
      // budget (offscreen, covered, detached mid-crawl) are expected and
      // survivable; we skip them. Anything else (selector-engine error,
      // navigation mid-snapshot, evaluate rejection) is a real failure and
      // must propagate so CI surfaces it.
      if (err instanceof Error && err.name === "TimeoutError") continue;
      throw err;
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
