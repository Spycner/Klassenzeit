/**
 * School validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { intRange, optionalString, requiredString } from "../utils";

export const createSchoolSchema = z
  .object({
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
  })
  .refine((data) => data.minGrade <= data.maxGrade, {
    message: "Minimum grade must be less than or equal to maximum grade",
    path: ["minGrade"],
  });

export const updateSchoolSchema = createSchoolSchema;

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;
