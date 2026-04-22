import { describe, expect, it } from "vitest";
import { formatApiDetail } from "./api-client";

describe("formatApiDetail", () => {
  it("returns the string body verbatim", () => {
    expect(formatApiDetail("Server unreachable")).toBe("Server unreachable");
  });

  it("returns detail when it is a string", () => {
    expect(formatApiDetail({ detail: "Session expired" })).toBe("Session expired");
  });

  it("flattens a Pydantic validation array and strips the leading body segment", () => {
    const body = {
      detail: [
        { loc: ["body", "email"], msg: "value is not a valid email address" },
        { loc: ["body", "password"], msg: "String should have at least 8 characters" },
      ],
    };
    expect(formatApiDetail(body)).toBe(
      "email: value is not a valid email address; password: String should have at least 8 characters",
    );
  });

  it("returns null for shapes it cannot interpret", () => {
    expect(formatApiDetail(null)).toBeNull();
    expect(formatApiDetail({})).toBeNull();
    expect(formatApiDetail({ detail: 42 })).toBeNull();
  });
});
