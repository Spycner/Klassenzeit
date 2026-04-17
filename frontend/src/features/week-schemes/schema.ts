import { z } from "zod";

export const WeekSchemeFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(500).optional(),
});

export type WeekSchemeFormValues = z.infer<typeof WeekSchemeFormSchema>;
