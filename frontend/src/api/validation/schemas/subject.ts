/**
 * Subject validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { optionalString, requiredString } from "../utils";

export const createSubjectSchema = z.object({
  name: requiredString(VALIDATION.NAME_LONG.MAX, "Name"),
  abbreviation: requiredString(
    VALIDATION.ABBREVIATION_MEDIUM.MAX,
    "Abbreviation",
  ),
  color: optionalString(VALIDATION.COLOR_HEX.MAX, "Color"),
  needsSpecialRoom: z.boolean().optional().default(false),
});

export const updateSubjectSchema = createSubjectSchema;

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
