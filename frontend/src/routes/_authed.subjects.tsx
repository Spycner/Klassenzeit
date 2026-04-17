import { createFileRoute } from "@tanstack/react-router";
import { SubjectsPage } from "@/features/subjects/subjects-page";

export const Route = createFileRoute("/_authed/subjects")({
  component: SubjectsPage,
});
