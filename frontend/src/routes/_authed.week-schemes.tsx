import { createFileRoute } from "@tanstack/react-router";
import { WeekSchemesPage } from "@/features/week-schemes/week-schemes-page";

export const Route = createFileRoute("/_authed/week-schemes")({
  component: WeekSchemesPage,
});
