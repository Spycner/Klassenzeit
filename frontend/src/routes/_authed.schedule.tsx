import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SchedulePage } from "@/features/schedule/schedule-page";

const scheduleSearchSchema = z.object({
  class: z.string().min(1).optional(),
});

export const Route = createFileRoute("/_authed/schedule")({
  component: SchedulePage,
  validateSearch: scheduleSearchSchema,
});
