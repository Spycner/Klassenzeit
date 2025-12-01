/**
 * Availability validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { intRange, optionalUuid } from "../utils";

const availabilityTypeSchema = z.enum(["AVAILABLE", "BLOCKED", "PREFERRED"]);

export const createAvailabilitySchema = z.object({
  termId: optionalUuid("Term"),
  dayOfWeek: intRange(
    VALIDATION.DAY_OF_WEEK.MIN,
    VALIDATION.DAY_OF_WEEK.MAX,
    "Day of week",
  ),
  period: intRange(VALIDATION.PERIOD.MIN, VALIDATION.PERIOD.MAX, "Period"),
  availabilityType: availabilityTypeSchema,
  reason: z.string().optional(),
});

export const updateAvailabilitySchema = createAvailabilitySchema;

export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
