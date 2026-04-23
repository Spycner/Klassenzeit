import { describe, expect, it } from "vitest";
import { dayLongKey, dayShortKey } from "./day-keys";

describe("dayShortKey", () => {
  it("maps 0..4 to typed daysShort keys", () => {
    expect(dayShortKey(0)).toBe("common.daysShort.0");
    expect(dayShortKey(1)).toBe("common.daysShort.1");
    expect(dayShortKey(2)).toBe("common.daysShort.2");
    expect(dayShortKey(3)).toBe("common.daysShort.3");
    expect(dayShortKey(4)).toBe("common.daysShort.4");
  });

  it("throws RangeError for out-of-range integers", () => {
    expect(() => dayShortKey(-1)).toThrow(RangeError);
    expect(() => dayShortKey(5)).toThrow(RangeError);
  });

  it("throws RangeError for non-integer numbers", () => {
    expect(() => dayShortKey(1.5)).toThrow(RangeError);
    expect(() => dayShortKey(Number.NaN)).toThrow(RangeError);
    expect(() => dayShortKey(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("dayLongKey", () => {
  it("maps 0..4 to typed daysLong keys", () => {
    expect(dayLongKey(0)).toBe("common.daysLong.0");
    expect(dayLongKey(1)).toBe("common.daysLong.1");
    expect(dayLongKey(2)).toBe("common.daysLong.2");
    expect(dayLongKey(3)).toBe("common.daysLong.3");
    expect(dayLongKey(4)).toBe("common.daysLong.4");
  });

  it("throws RangeError for out-of-range integers", () => {
    expect(() => dayLongKey(-1)).toThrow(RangeError);
    expect(() => dayLongKey(5)).toThrow(RangeError);
  });

  it("throws RangeError for non-integer numbers", () => {
    expect(() => dayLongKey(1.5)).toThrow(RangeError);
    expect(() => dayLongKey(Number.NaN)).toThrow(RangeError);
    expect(() => dayLongKey(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
