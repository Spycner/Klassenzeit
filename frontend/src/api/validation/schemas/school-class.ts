/**
 * SchoolClass validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import {
  intRange,
  optionalIntRange,
  optionalUuid,
  requiredString,
} from "../utils";

export const createSchoolClassSchema = z.object({
  name: requiredString(VALIDATION.NAME_SHORT.MAX, "Name"),
  gradeLevel: intRange(
    VALIDATION.GRADE_LEVEL.MIN,
    VALIDATION.GRADE_LEVEL.MAX,
    "Grade level",
  ),
  studentCount: optionalIntRange(
    VALIDATION.STUDENT_COUNT.MIN,
    VALIDATION.STUDENT_COUNT.MAX,
    "Student count",
  ),
  classTeacherId: optionalUuid("Class teacher"),
});

export const updateSchoolClassSchema = createSchoolClassSchema;

export type CreateSchoolClassInput = z.infer<typeof createSchoolClassSchema>;
export type UpdateSchoolClassInput = z.infer<typeof updateSchoolClassSchema>;
