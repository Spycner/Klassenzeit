import { describe, expect, it } from "vitest";
import { createRoomSchema } from "./room";

describe("createRoomSchema", () => {
  const validRoom = {
    name: "Room 101",
  };

  describe("required fields", () => {
    it("validates a minimal valid room", () => {
      const result = createRoomSchema.safeParse(validRoom);
      expect(result.success).toBe(true);
    });

    it("fails when name is missing", () => {
      const result = createRoomSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("fails when name is empty", () => {
      const result = createRoomSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("name length limits", () => {
    it("accepts name at exactly 50 characters", () => {
      const result = createRoomSchema.safeParse({
        name: "a".repeat(50),
      });
      expect(result.success).toBe(true);
    });

    it("fails when name exceeds 50 characters", () => {
      const result = createRoomSchema.safeParse({
        name: "a".repeat(51),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("building validation", () => {
    it("accepts valid building", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        building: "Main Building",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined building", () => {
      const result = createRoomSchema.safeParse(validRoom);
      expect(result.success).toBe(true);
    });

    it("accepts building at exactly 100 characters", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        building: "a".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it("fails when building exceeds 100 characters", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        building: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("capacity validation", () => {
    it("accepts valid capacity", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        capacity: 30,
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined capacity", () => {
      const result = createRoomSchema.safeParse(validRoom);
      expect(result.success).toBe(true);
    });

    it("accepts minimum capacity of 1", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        capacity: 1,
      });
      expect(result.success).toBe(true);
    });

    it("fails when capacity is 0", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        capacity: 0,
      });
      expect(result.success).toBe(false);
    });

    it("fails when capacity is negative", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        capacity: -1,
      });
      expect(result.success).toBe(false);
    });

    it("fails when capacity is not an integer", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        capacity: 30.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("features validation", () => {
    it("accepts valid features", () => {
      const result = createRoomSchema.safeParse({
        ...validRoom,
        features: "projector,whiteboard",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined features", () => {
      const result = createRoomSchema.safeParse(validRoom);
      expect(result.success).toBe(true);
    });
  });
});
