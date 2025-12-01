import { describe, expect, it } from "vitest";
import { createTimeSlotSchema } from "./time-slot";

describe("createTimeSlotSchema", () => {
  const validTimeSlot = {
    dayOfWeek: 0,
    period: 1,
    startTime: "08:00",
    endTime: "08:45",
  };

  describe("required fields", () => {
    it("validates a minimal valid time slot", () => {
      const result = createTimeSlotSchema.safeParse(validTimeSlot);
      expect(result.success).toBe(true);
    });

    it("fails when dayOfWeek is missing", () => {
      const { dayOfWeek: _, ...rest } = validTimeSlot;
      const result = createTimeSlotSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when period is missing", () => {
      const { period: _, ...rest } = validTimeSlot;
      const result = createTimeSlotSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when startTime is missing", () => {
      const { startTime: _, ...rest } = validTimeSlot;
      const result = createTimeSlotSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when endTime is missing", () => {
      const { endTime: _, ...rest } = validTimeSlot;
      const result = createTimeSlotSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe("dayOfWeek validation", () => {
    it("accepts Monday (0)", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        dayOfWeek: 0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts Friday (4)", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        dayOfWeek: 4,
      });
      expect(result.success).toBe(true);
    });

    it("fails for Saturday (5)", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        dayOfWeek: 5,
      });
      expect(result.success).toBe(false);
    });

    it("fails for negative day", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        dayOfWeek: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("period validation", () => {
    it("accepts period 1", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        period: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts period 10", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        period: 10,
      });
      expect(result.success).toBe(true);
    });

    it("fails for period 0", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        period: 0,
      });
      expect(result.success).toBe(false);
    });

    it("fails for period 11", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        period: 11,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("time format validation", () => {
    it("accepts HH:mm format", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        startTime: "08:00",
        endTime: "08:45",
      });
      expect(result.success).toBe(true);
    });

    it("accepts HH:mm:ss format", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        startTime: "08:00:00",
        endTime: "08:45:00",
      });
      expect(result.success).toBe(true);
    });

    it("fails for invalid time format", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        startTime: "8:00",
      });
      expect(result.success).toBe(false);
    });

    it("fails for 12-hour format", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        startTime: "8:00 AM",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("accepts isBreak true", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        isBreak: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid label", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        label: "Morning Break",
      });
      expect(result.success).toBe(true);
    });

    it("fails when label exceeds 100 characters", () => {
      const result = createTimeSlotSchema.safeParse({
        ...validTimeSlot,
        label: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });
});
