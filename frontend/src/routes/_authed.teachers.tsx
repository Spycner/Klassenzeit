import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TeachersPage } from "@/features/teachers/teachers-page";

const teachersSearchSchema = z.object({
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authed/teachers")({
  component: TeachersPage,
  validateSearch: teachersSearchSchema,
});
