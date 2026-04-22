import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  computeDiff,
  dedupeFindings,
  type Finding,
  type State,
  type StateSnapshot,
  signatureOf,
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

  await descriptor.locator.hover({ timeout: 2_000, trial: false });
  const hover = await snapshotStyle(descriptor.locator, STRUCTURAL_PROPERTIES);

  await resetInteractionState(page);
  await descriptor.locator.focus({ timeout: 2_000 });
  const focus = await snapshotStyle(descriptor.locator, STRUCTURAL_PROPERTIES);

  await resetInteractionState(page);
  await descriptor.locator.hover({ timeout: 2_000 });
  await page.mouse.down();
  const active = await snapshotStyle(descriptor.locator, STRUCTURAL_PROPERTIES);
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
