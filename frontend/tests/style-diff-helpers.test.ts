import { describe, expect, it } from "vitest";
import {
  computeDiff,
  dedupeFindings,
  type Finding,
  type StateSnapshot,
  signatureOf,
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
