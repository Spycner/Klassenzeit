import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SchoolClassesPage } from "@/features/school-classes/school-classes-page";

const schoolClassesSearchSchema = z.object({
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authed/school-classes")({
  component: SchoolClassesPage,
  validateSearch: schoolClassesSearchSchema,
});
