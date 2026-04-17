import { z } from "zod";

export const RoomFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  short_name: z.string().trim().min(1, "Short name is required").max(10),
  capacity: z.number().int().min(1).optional(),
  suitability_mode: z.enum(["general", "specialized"]),
});

export type RoomFormValues = z.infer<typeof RoomFormSchema>;
