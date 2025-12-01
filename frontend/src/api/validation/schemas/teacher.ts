/**
 * Teacher validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { optionalEmail, optionalIntRange, requiredString } from "../utils";

export const createTeacherSchema = z.object({
  firstName: requiredString(VALIDATION.NAME_LONG.MAX, "First name"),
  lastName: requiredString(VALIDATION.NAME_LONG.MAX, "Last name"),
  email: optionalEmail(VALIDATION.NAME_EXTRA.MAX),
  abbreviation: requiredString(
    VALIDATION.ABBREVIATION_SHORT.MAX,
    "Abbreviation",
  ),
  maxHoursPerWeek: optionalIntRange(
    VALIDATION.HOURS_PER_WEEK.MIN,
    VALIDATION.HOURS_PER_WEEK.MAX,
    "Max hours per week",
  ),
  isPartTime: z.boolean().optional(),
});

export const updateTeacherSchema = createTeacherSchema;

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
