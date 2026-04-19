import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RoomsPage } from "@/features/rooms/rooms-page";

const roomsSearchSchema = z.object({
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authed/rooms")({
  component: RoomsPage,
  validateSearch: roomsSearchSchema,
});
