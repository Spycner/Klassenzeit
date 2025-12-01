import { describe, expect, it } from "vitest";
import { createTeacherSchema } from "./teacher";

describe("createTeacherSchema", () => {
  const validTeacher = {
    firstName: "John",
    lastName: "Doe",
    abbreviation: "JD",
  };

  describe("required fields", () => {
    it("validates a minimal valid teacher", () => {
      const result = createTeacherSchema.safeParse(validTeacher);
      expect(result.success).toBe(true);
    });

    it("fails when firstName is missing", () => {
      const result = createTeacherSchema.safeParse({
        lastName: "Doe",
        abbreviation: "JD",
      });
      expect(result.success).toBe(false);
    });

    it("fails when lastName is missing", () => {
      const result = createTeacherSchema.safeParse({
        firstName: "John",
        abbreviation: "JD",
      });
      expect(result.success).toBe(false);
    });

    it("fails when abbreviation is missing", () => {
      const result = createTeacherSchema.safeParse({
        firstName: "John",
        lastName: "Doe",
      });
      expect(result.success).toBe(false);
    });

    it("fails when firstName is empty", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        firstName: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("string length limits", () => {
    it("fails when firstName exceeds 100 characters", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        firstName: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("fails when lastName exceeds 100 characters", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        lastName: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("fails when abbreviation exceeds 5 characters", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        abbreviation: "ABCDEF",
      });
      expect(result.success).toBe(false);
    });

    it("accepts abbreviation at exactly 5 characters", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        abbreviation: "ABCDE",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("email validation", () => {
    it("accepts valid email", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        email: "john.doe@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined email", () => {
      const result = createTeacherSchema.safeParse(validTeacher);
      expect(result.success).toBe(true);
    });

    it("accepts empty string email", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        email: "",
      });
      expect(result.success).toBe(true);
    });

    it("fails for invalid email format", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        email: "invalid-email",
      });
      expect(result.success).toBe(false);
    });

    it("fails when email exceeds 255 characters", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        email: `${"a".repeat(250)}@example.com`,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("maxHoursPerWeek validation", () => {
    it("accepts valid maxHoursPerWeek", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        maxHoursPerWeek: 25,
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined maxHoursPerWeek", () => {
      const result = createTeacherSchema.safeParse(validTeacher);
      expect(result.success).toBe(true);
    });

    it("accepts minimum value of 1", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        maxHoursPerWeek: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts maximum value of 50", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        maxHoursPerWeek: 50,
      });
      expect(result.success).toBe(true);
    });

    it("fails when maxHoursPerWeek is 0", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        maxHoursPerWeek: 0,
      });
      expect(result.success).toBe(false);
    });

    it("fails when maxHoursPerWeek exceeds 50", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        maxHoursPerWeek: 51,
      });
      expect(result.success).toBe(false);
    });

    it("fails when maxHoursPerWeek is not an integer", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        maxHoursPerWeek: 25.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("isPartTime validation", () => {
    it("accepts true", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        isPartTime: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts false", () => {
      const result = createTeacherSchema.safeParse({
        ...validTeacher,
        isPartTime: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined", () => {
      const result = createTeacherSchema.safeParse(validTeacher);
      expect(result.success).toBe(true);
    });
  });
});
