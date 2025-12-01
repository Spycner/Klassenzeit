/**
 * TimeSlot validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { intRange, optionalString, requiredTime } from "../utils";

export const createTimeSlotSchema = z.object({
  dayOfWeek: intRange(
    VALIDATION.DAY_OF_WEEK.MIN,
    VALIDATION.DAY_OF_WEEK.MAX,
    "Day of week",
  ),
  period: intRange(VALIDATION.PERIOD.MIN, VALIDATION.PERIOD.MAX, "Period"),
  startTime: requiredTime("Start time"),
  endTime: requiredTime("End time"),
  isBreak: z.boolean().optional(),
  label: optionalString(VALIDATION.LABEL.MAX, "Label"),
});

export const updateTimeSlotSchema = createTimeSlotSchema;

export type CreateTimeSlotInput = z.infer<typeof createTimeSlotSchema>;
export type UpdateTimeSlotInput = z.infer<typeof updateTimeSlotSchema>;
