import { describe, expect, it } from "vitest";
import { createTermSchema } from "./term";

describe("createTermSchema", () => {
  const validTerm = {
    name: "Fall 2024",
    startDate: "2024-09-01",
    endDate: "2025-01-31",
  };

  describe("required fields", () => {
    it("validates a minimal valid term", () => {
      const result = createTermSchema.safeParse(validTerm);
      expect(result.success).toBe(true);
    });

    it("fails when name is missing", () => {
      const { name: _, ...rest } = validTerm;
      const result = createTermSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when startDate is missing", () => {
      const { startDate: _, ...rest } = validTerm;
      const result = createTermSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when endDate is missing", () => {
      const { endDate: _, ...rest } = validTerm;
      const result = createTermSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe("date format validation", () => {
    it("accepts valid ISO date format", () => {
      const result = createTermSchema.safeParse(validTerm);
      expect(result.success).toBe(true);
    });

    it("fails for invalid date format", () => {
      const result = createTermSchema.safeParse({
        ...validTerm,
        startDate: "09/01/2024",
      });
      expect(result.success).toBe(false);
    });

    it("fails for date with time component", () => {
      const result = createTermSchema.safeParse({
        ...validTerm,
        startDate: "2024-09-01T00:00:00",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("date range validation", () => {
    it("accepts startDate equal to endDate", () => {
      const result = createTermSchema.safeParse({
        ...validTerm,
        startDate: "2024-09-01",
        endDate: "2024-09-01",
      });
      expect(result.success).toBe(true);
    });

    it("fails when startDate is after endDate", () => {
      const result = createTermSchema.safeParse({
        ...validTerm,
        startDate: "2025-02-01",
        endDate: "2025-01-31",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("accepts isCurrent true", () => {
      const result = createTermSchema.safeParse({
        ...validTerm,
        isCurrent: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts isCurrent false", () => {
      const result = createTermSchema.safeParse({
        ...validTerm,
        isCurrent: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined isCurrent", () => {
      const result = createTermSchema.safeParse(validTerm);
      expect(result.success).toBe(true);
    });
  });

  describe("name length limits", () => {
    it("accepts name at exactly 100 characters", () => {
      const result = createTermSchema.safeParse({
        ...validTerm,
        name: "a".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it("fails when name exceeds 100 characters", () => {
      const result = createTermSchema.safeParse({
        ...validTerm,
        name: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });
});
