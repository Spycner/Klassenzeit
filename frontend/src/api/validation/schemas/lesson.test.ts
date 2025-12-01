import { describe, expect, it } from "vitest";
import { createLessonSchema } from "./lesson";

describe("createLessonSchema", () => {
  const validLesson = {
    schoolClassId: "550e8400-e29b-41d4-a716-446655440001",
    teacherId: "550e8400-e29b-41d4-a716-446655440002",
    subjectId: "550e8400-e29b-41d4-a716-446655440003",
    timeslotId: "550e8400-e29b-41d4-a716-446655440004",
  };

  describe("required fields", () => {
    it("validates a minimal valid lesson", () => {
      const result = createLessonSchema.safeParse(validLesson);
      expect(result.success).toBe(true);
    });

    it("fails when schoolClassId is missing", () => {
      const { schoolClassId: _, ...rest } = validLesson;
      const result = createLessonSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when teacherId is missing", () => {
      const { teacherId: _, ...rest } = validLesson;
      const result = createLessonSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when subjectId is missing", () => {
      const { subjectId: _, ...rest } = validLesson;
      const result = createLessonSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when timeslotId is missing", () => {
      const { timeslotId: _, ...rest } = validLesson;
      const result = createLessonSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe("UUID validation", () => {
    it("fails for invalid schoolClassId UUID", () => {
      const result = createLessonSchema.safeParse({
        ...validLesson,
        schoolClassId: "invalid-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("fails for invalid teacherId UUID", () => {
      const result = createLessonSchema.safeParse({
        ...validLesson,
        teacherId: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("accepts valid roomId UUID", () => {
      const result = createLessonSchema.safeParse({
        ...validLesson,
        roomId: "550e8400-e29b-41d4-a716-446655440005",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined roomId", () => {
      const result = createLessonSchema.safeParse(validLesson);
      expect(result.success).toBe(true);
    });

    it("fails for invalid roomId UUID", () => {
      const result = createLessonSchema.safeParse({
        ...validLesson,
        roomId: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("weekPattern validation", () => {
    it("accepts EVERY pattern", () => {
      const result = createLessonSchema.safeParse({
        ...validLesson,
        weekPattern: "EVERY",
      });
      expect(result.success).toBe(true);
    });

    it("accepts A pattern", () => {
      const result = createLessonSchema.safeParse({
        ...validLesson,
        weekPattern: "A",
      });
      expect(result.success).toBe(true);
    });

    it("accepts B pattern", () => {
      const result = createLessonSchema.safeParse({
        ...validLesson,
        weekPattern: "B",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined weekPattern", () => {
      const result = createLessonSchema.safeParse(validLesson);
      expect(result.success).toBe(true);
    });

    it("fails for invalid weekPattern", () => {
      const result = createLessonSchema.safeParse({
        ...validLesson,
        weekPattern: "C",
      });
      expect(result.success).toBe(false);
    });
  });
});
