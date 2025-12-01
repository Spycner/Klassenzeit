import { describe, expect, it } from "vitest";
import { createSchoolClassSchema } from "./school-class";

describe("createSchoolClassSchema", () => {
  const validSchoolClass = {
    name: "5a",
    gradeLevel: 5,
  };

  describe("required fields", () => {
    it("validates a minimal valid school class", () => {
      const result = createSchoolClassSchema.safeParse(validSchoolClass);
      expect(result.success).toBe(true);
    });

    it("fails when name is missing", () => {
      const result = createSchoolClassSchema.safeParse({
        gradeLevel: 5,
      });
      expect(result.success).toBe(false);
    });

    it("fails when gradeLevel is missing", () => {
      const result = createSchoolClassSchema.safeParse({
        name: "5a",
      });
      expect(result.success).toBe(false);
    });

    it("fails when name is empty", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        name: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("name length limits", () => {
    it("accepts name at exactly 20 characters", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        name: "a".repeat(20),
      });
      expect(result.success).toBe(true);
    });

    it("fails when name exceeds 20 characters", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        name: "a".repeat(21),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("gradeLevel validation", () => {
    it("accepts minimum grade level of 1", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        gradeLevel: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts maximum grade level of 13", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        gradeLevel: 13,
      });
      expect(result.success).toBe(true);
    });

    it("fails when gradeLevel is 0", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        gradeLevel: 0,
      });
      expect(result.success).toBe(false);
    });

    it("fails when gradeLevel exceeds 13", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        gradeLevel: 14,
      });
      expect(result.success).toBe(false);
    });

    it("fails when gradeLevel is not an integer", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        gradeLevel: 5.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("studentCount validation", () => {
    it("accepts valid studentCount", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        studentCount: 25,
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined studentCount", () => {
      const result = createSchoolClassSchema.safeParse(validSchoolClass);
      expect(result.success).toBe(true);
    });

    it("accepts minimum value of 1", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        studentCount: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts maximum value of 100", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        studentCount: 100,
      });
      expect(result.success).toBe(true);
    });

    it("fails when studentCount is 0", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        studentCount: 0,
      });
      expect(result.success).toBe(false);
    });

    it("fails when studentCount exceeds 100", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        studentCount: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("classTeacherId validation", () => {
    it("accepts valid UUID", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        classTeacherId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined classTeacherId", () => {
      const result = createSchoolClassSchema.safeParse(validSchoolClass);
      expect(result.success).toBe(true);
    });

    it("fails for invalid UUID format", () => {
      const result = createSchoolClassSchema.safeParse({
        ...validSchoolClass,
        classTeacherId: "invalid-uuid",
      });
      expect(result.success).toBe(false);
    });
  });
});
