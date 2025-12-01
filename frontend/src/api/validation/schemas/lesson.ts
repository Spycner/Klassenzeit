/**
 * Lesson validation schemas
 */

import { z } from "zod";
import { optionalUuid, requiredUuid } from "../utils";

const weekPatternSchema = z.enum(["EVERY", "A", "B"]);

export const createLessonSchema = z.object({
  schoolClassId: requiredUuid("School class"),
  teacherId: requiredUuid("Teacher"),
  subjectId: requiredUuid("Subject"),
  timeslotId: requiredUuid("Time slot"),
  roomId: optionalUuid("Room"),
  weekPattern: weekPatternSchema.optional(),
});

export const updateLessonSchema = createLessonSchema;

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
