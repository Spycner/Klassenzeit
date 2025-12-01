import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn utility", () => {
  it("merges class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("handles undefined values", () => {
    expect(cn("foo", undefined, "bar")).toBe("foo bar");
  });

  it("merges tailwind classes correctly", () => {
    // tailwind-merge deduplicates conflicting utilities
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });
});
