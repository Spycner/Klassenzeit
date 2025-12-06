import { describe, expect, it } from "vitest";
import { createSchoolSchema, updateSchoolSchema } from "./school";

describe("createSchoolSchema", () => {
  const validSchool = {
    name: "Test School",
    slug: "test-school",
    schoolType: "gymnasium",
    minGrade: 5,
    maxGrade: 12,
    initialAdminUserId: "550e8400-e29b-41d4-a716-446655440000",
  };

  describe("required fields", () => {
    it("validates a minimal valid school", () => {
      const result = createSchoolSchema.safeParse(validSchool);
      expect(result.success).toBe(true);
    });

    it("fails when name is missing", () => {
      const { name: _, ...rest } = validSchool;
      const result = createSchoolSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when slug is missing", () => {
      const { slug: _, ...rest } = validSchool;
      const result = createSchoolSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when schoolType is missing", () => {
      const { schoolType: _, ...rest } = validSchool;
      const result = createSchoolSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when initialAdminUserId is missing", () => {
      const { initialAdminUserId: _, ...rest } = validSchool;
      const result = createSchoolSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when initialAdminUserId is not a valid UUID", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        initialAdminUserId: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid UUID for initialAdminUserId", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        initialAdminUserId: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("slug validation", () => {
    it("accepts valid slug with lowercase letters", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        slug: "my-school",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid slug with numbers", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        slug: "school-123",
      });
      expect(result.success).toBe(true);
    });

    it("fails when slug contains uppercase letters", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        slug: "My-School",
      });
      expect(result.success).toBe(false);
    });

    it("fails when slug contains spaces", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        slug: "my school",
      });
      expect(result.success).toBe(false);
    });

    it("fails when slug contains special characters", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        slug: "my_school",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("grade range validation", () => {
    it("accepts valid grade range", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        minGrade: 1,
        maxGrade: 13,
      });
      expect(result.success).toBe(true);
    });

    it("accepts same min and max grade", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        minGrade: 5,
        maxGrade: 5,
      });
      expect(result.success).toBe(true);
    });

    it("fails when minGrade is greater than maxGrade", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        minGrade: 10,
        maxGrade: 5,
      });
      expect(result.success).toBe(false);
    });

    it("fails when grade is below 1", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        minGrade: 0,
      });
      expect(result.success).toBe(false);
    });

    it("fails when grade exceeds 13", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        maxGrade: 14,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("accepts valid timezone", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        timezone: "Europe/Berlin",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined timezone", () => {
      const result = createSchoolSchema.safeParse(validSchool);
      expect(result.success).toBe(true);
    });

    it("accepts valid settings", () => {
      const result = createSchoolSchema.safeParse({
        ...validSchool,
        settings: '{"theme":"dark"}',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("updateSchoolSchema", () => {
  const validUpdateSchool = {
    name: "Test School",
    slug: "test-school",
    schoolType: "gymnasium",
    minGrade: 5,
    maxGrade: 12,
  };

  it("validates without initialAdminUserId", () => {
    const result = updateSchoolSchema.safeParse(validUpdateSchool);
    expect(result.success).toBe(true);
  });

  it("fails when name is missing", () => {
    const { name: _, ...rest } = validUpdateSchool;
    const result = updateSchoolSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("fails when minGrade is greater than maxGrade", () => {
    const result = updateSchoolSchema.safeParse({
      ...validUpdateSchool,
      minGrade: 10,
      maxGrade: 5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional timezone", () => {
    const result = updateSchoolSchema.safeParse({
      ...validUpdateSchool,
      timezone: "Europe/Berlin",
    });
    expect(result.success).toBe(true);
  });
});
