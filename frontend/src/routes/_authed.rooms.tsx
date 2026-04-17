import { createFileRoute } from "@tanstack/react-router";
import { RoomsPage } from "@/features/rooms/rooms-page";

export const Route = createFileRoute("/_authed/rooms")({
  component: RoomsPage,
});
