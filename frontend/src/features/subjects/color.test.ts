import { describe, expect, test } from "vitest";
import { autoPickColor, isValidColor, resolveSubjectColor } from "./color";

describe("resolveSubjectColor", () => {
  test("maps chart tokens to CSS variables", () => {
    expect(resolveSubjectColor("chart-1")).toBe("var(--chart-1)");
    expect(resolveSubjectColor("chart-12")).toBe("var(--chart-12)");
  });

  test("returns hex literals unchanged", () => {
    expect(resolveSubjectColor("#2563eb")).toBe("#2563eb");
    expect(resolveSubjectColor("#abcdef")).toBe("#abcdef");
  });
});

describe("autoPickColor", () => {
  test("is deterministic for the same name", () => {
    expect(autoPickColor("Mathematik")).toBe(autoPickColor("Mathematik"));
  });

  test("is case-insensitive", () => {
    expect(autoPickColor("Art")).toBe(autoPickColor("art"));
  });

  test("always returns a chart token in the 1..12 range", () => {
    const names = ["a", "longer name", "Ümlaut", "123"];
    for (const name of names) {
      const value = autoPickColor(name);
      expect(value).toMatch(/^chart-(1[0-2]|[1-9])$/);
    }
  });
});

describe("isValidColor", () => {
  test("accepts chart tokens 1..12", () => {
    for (let i = 1; i <= 12; i++) expect(isValidColor(`chart-${i}`)).toBe(true);
  });

  test("rejects out-of-range chart tokens", () => {
    expect(isValidColor("chart-0")).toBe(false);
    expect(isValidColor("chart-13")).toBe(false);
    expect(isValidColor("chart-abc")).toBe(false);
  });

  test("accepts 6-digit hex (case-insensitive)", () => {
    expect(isValidColor("#abcdef")).toBe(true);
    expect(isValidColor("#ABCDEF")).toBe(true);
    expect(isValidColor("#123456")).toBe(true);
  });

  test("rejects malformed hex", () => {
    expect(isValidColor("abcdef")).toBe(false); // missing #
    expect(isValidColor("#abc")).toBe(false); // 3-digit
    expect(isValidColor("#gggggg")).toBe(false); // non-hex
    expect(isValidColor("")).toBe(false);
  });
});
