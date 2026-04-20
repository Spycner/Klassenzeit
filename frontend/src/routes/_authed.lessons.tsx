import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LessonsPage } from "@/features/lessons/lessons-page";

const lessonsSearchSchema = z.object({
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authed/lessons")({
  component: LessonsPage,
  validateSearch: lessonsSearchSchema,
});
