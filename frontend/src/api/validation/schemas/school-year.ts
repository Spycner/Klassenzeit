/**
 * SchoolYear validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { requiredDate, requiredString } from "../utils";

export const createSchoolYearSchema = z
  .object({
    name: requiredString(VALIDATION.NAME_MEDIUM.MAX, "Name"),
    startDate: requiredDate("Start date"),
    endDate: requiredDate("End date"),
    isCurrent: z.boolean().optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "Start date must be before or equal to end date",
    path: ["startDate"],
  });

export const updateSchoolYearSchema = createSchoolYearSchema;

export type CreateSchoolYearInput = z.infer<typeof createSchoolYearSchema>;
export type UpdateSchoolYearInput = z.infer<typeof updateSchoolYearSchema>;
