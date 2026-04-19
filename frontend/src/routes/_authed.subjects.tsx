import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SubjectsPage } from "@/features/subjects/subjects-page";

const subjectsSearchSchema = z.object({
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authed/subjects")({
  component: SubjectsPage,
  validateSearch: subjectsSearchSchema,
});
