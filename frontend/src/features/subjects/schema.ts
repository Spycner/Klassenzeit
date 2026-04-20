import { z } from "zod";
import { COLOR_PATTERN } from "./color";

export const SubjectFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  short_name: z.string().trim().min(1, "Short name is required").max(10),
  color: z.string().regex(COLOR_PATTERN, "Invalid color"),
});

export type SubjectFormValues = z.infer<typeof SubjectFormSchema>;
