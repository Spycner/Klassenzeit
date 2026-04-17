import { createFileRoute } from "@tanstack/react-router";
import { TeachersPage } from "@/features/teachers/teachers-page";

export const Route = createFileRoute("/_authed/teachers")({
  component: TeachersPage,
});
