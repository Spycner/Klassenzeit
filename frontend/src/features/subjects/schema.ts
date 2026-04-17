import { z } from "zod";

export const SubjectFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  short_name: z.string().trim().min(1, "Short name is required").max(10),
});

export type SubjectFormValues = z.infer<typeof SubjectFormSchema>;
