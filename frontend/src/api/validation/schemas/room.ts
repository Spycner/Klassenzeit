/**
 * Room validation schemas
 */

import { z } from "zod";
import { VALIDATION } from "../constants";
import { optionalIntMin, optionalString, requiredString } from "../utils";

export const createRoomSchema = z.object({
  name: requiredString(VALIDATION.NAME_MEDIUM.MAX, "Name"),
  building: optionalString(VALIDATION.NAME_LONG.MAX, "Building"),
  capacity: optionalIntMin(VALIDATION.ROOM_CAPACITY.MIN, "Capacity"),
  features: z.string().optional(),
});

export const updateRoomSchema = createRoomSchema;

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
