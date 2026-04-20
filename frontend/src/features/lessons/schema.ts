import { z } from "zod";

export const UNASSIGNED = "__unassigned__";

export const LessonFormSchema = z.object({
  school_class_id: z.string().uuid("Class is required"),
  subject_id: z.string().uuid("Subject is required"),
  teacher_id: z.string().min(1, "Teacher is required"),
  hours_per_week: z.number().int().min(1, "Hours must be at least 1"),
  preferred_block_size: z.number().int().min(1).max(2),
});

export type LessonFormValues = z.infer<typeof LessonFormSchema>;
