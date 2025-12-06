/**
 * School validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { intRange, optionalString, requiredString } from "../utils";

/** Base schema for school fields shared between create and update */
const baseSchoolSchema = z.object({
  name: requiredString(VALIDATION.NAME_EXTRA.MAX, "Name"),
  slug: requiredString(VALIDATION.SLUG.MAX, "Slug").regex(
    VALIDATION.SLUG.PATTERN,
    "Slug must contain only lowercase letters, numbers, and hyphens",
  ),
  schoolType: requiredString(VALIDATION.NAME_MEDIUM.MAX, "School type"),
  minGrade: intRange(
    VALIDATION.GRADE_LEVEL.MIN,
    VALIDATION.GRADE_LEVEL.MAX,
    "Minimum grade",
  ),
  maxGrade: intRange(
    VALIDATION.GRADE_LEVEL.MIN,
    VALIDATION.GRADE_LEVEL.MAX,
    "Maximum grade",
  ),
  timezone: optionalString(VALIDATION.TIMEZONE.MAX, "Timezone"),
  settings: z.string().optional(),
});

const gradeRefinement = (data: { minGrade: number; maxGrade: number }) =>
  data.minGrade <= data.maxGrade;

const gradeRefinementMessage = {
  message: "Minimum grade must be less than or equal to maximum grade",
  path: ["minGrade"],
};

/** Schema for creating a school (requires initial admin) */
export const createSchoolSchema = baseSchoolSchema
  .extend({
    initialAdminUserId: z.string().uuid("Initial admin must be a valid user"),
  })
  .refine(gradeRefinement, gradeRefinementMessage);

/** Schema for updating a school (no initial admin needed) */
export const updateSchoolSchema = baseSchoolSchema.refine(
  gradeRefinement,
  gradeRefinementMessage,
);

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;
