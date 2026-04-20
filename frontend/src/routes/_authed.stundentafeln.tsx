import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { StundentafelnPage } from "@/features/stundentafeln/stundentafeln-page";

const stundentafelnSearchSchema = z.object({
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authed/stundentafeln")({
  component: StundentafelnPage,
  validateSearch: stundentafelnSearchSchema,
});
