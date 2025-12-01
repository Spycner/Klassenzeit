/**
 * Term validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { requiredDate, requiredString } from "../utils";

export const createTermSchema = z
  .object({
    name: requiredString(VALIDATION.NAME_LONG.MAX, "Name"),
    startDate: requiredDate("Start date"),
    endDate: requiredDate("End date"),
    isCurrent: z.boolean().optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "Start date must be before or equal to end date",
    path: ["startDate"],
  });

export const updateTermSchema = createTermSchema;

export type CreateTermInput = z.infer<typeof createTermSchema>;
export type UpdateTermInput = z.infer<typeof updateTermSchema>;
