/**
 * Qualification validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { optionalIntRange, requiredUuid } from "../utils";

const qualificationLevelSchema = z.enum(["PRIMARY", "SECONDARY", "SUBSTITUTE"]);

const gradeLevelSchema = z
  .number()
  .int()
  .min(VALIDATION.GRADE_LEVEL.MIN)
  .max(VALIDATION.GRADE_LEVEL.MAX);

export const createQualificationSchema = z.object({
  subjectId: requiredUuid("Subject"),
  qualificationLevel: qualificationLevelSchema,
  canTeachGrades: z.array(gradeLevelSchema).optional(),
  maxHoursPerWeek: optionalIntRange(
    VALIDATION.HOURS_PER_WEEK.MIN,
    VALIDATION.HOURS_PER_WEEK.MAX,
    "Max hours per week",
  ),
});

export const updateQualificationSchema = createQualificationSchema;

export type CreateQualificationInput = z.infer<
  typeof createQualificationSchema
>;
export type UpdateQualificationInput = z.infer<
  typeof updateQualificationSchema
>;
