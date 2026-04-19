import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WeekSchemesPage } from "@/features/week-schemes/week-schemes-page";

const weekSchemesSearchSchema = z.object({
  create: z.literal("1").optional(),
  id: z.string().optional(),
});

export const Route = createFileRoute("/_authed/week-schemes")({
  component: WeekSchemesPage,
  validateSearch: weekSchemesSearchSchema,
});
