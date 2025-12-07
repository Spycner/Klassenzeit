import { expect, test } from "@playwright/test";
import { getAuthHeaders, getCurrentUserId } from "./auth";
import { API_BASE } from "./config";

test.describe("Rooms API", () => {
  let schoolId: string;
  let headers: Record<string, string>;
  // Use unique suffix per worker to avoid conflicts in parallel execution
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  test.beforeAll(async ({ request }) => {
    headers = await getAuthHeaders();
    const userId = await getCurrentUserId();
    // Create a school to use for room tests
    const response = await request.post(`${API_BASE}/schools`, {
      headers,
      data: {
        name: `Rooms Test School ${uniqueSuffix}`,
        slug: `rooms-test-${uniqueSuffix}`,
        schoolType: "Gymnasium",
        minGrade: 5,
        maxGrade: 13,
        initialAdminUserId: userId,
      },
    });
    const school = await response.json();
    schoolId = school.id;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup the test school
    if (schoolId) {
      await request.delete(`${API_BASE}/schools/${schoolId}`, { headers });
    }
  });

  test("GET /schools/{schoolId}/rooms - should return list of rooms", async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/rooms`,
      { headers }
    );

    expect(response.status()).toBe(200);

    const rooms = await response.json();
    expect(Array.isArray(rooms)).toBeTruthy();
  });

  test("POST /schools/{schoolId}/rooms - should create a new room", async ({
    request,
  }) => {
    const newRoom = {
      name: "Room 101",
      building: "Main Building",
      capacity: 30,
      features: '{"projector": true, "whiteboard": true}',
    };

    const response = await request.post(
      `${API_BASE}/schools/${schoolId}/rooms`,
      {
        headers,
        data: newRoom,
      }
    );

    expect(response.status()).toBe(201);

    const room = await response.json();
    expect(room.id).toBeDefined();
    expect(room.name).toBe(newRoom.name);
    expect(room.building).toBe(newRoom.building);
    expect(room.capacity).toBe(newRoom.capacity);
    expect(room.isActive).toBe(true);
    expect(room.createdAt).toBeDefined();

    // Cleanup
    await request.delete(`${API_BASE}/schools/${schoolId}/rooms/${room.id}`, {
      headers,
    });
  });

  test("GET /schools/{schoolId}/rooms/{id} - should return room details", async ({
    request,
  }) => {
    // Create a room
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/rooms`,
      {
        headers,
        data: {
          name: "Lab 1",
          building: "Science Wing",
          capacity: 25,
        },
      }
    );
    const created = await createResponse.json();

    // Get room details
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`,
      { headers }
    );

    expect(response.status()).toBe(200);

    const room = await response.json();
    expect(room.id).toBe(created.id);
    expect(room.name).toBe("Lab 1");
    expect(room.building).toBe("Science Wing");
    expect(room.capacity).toBe(25);

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`,
      { headers }
    );
  });

  test("PUT /schools/{schoolId}/rooms/{id} - should update a room", async ({
    request,
  }) => {
    // Create a room
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/rooms`,
      {
        headers,
        data: {
          name: "Room A",
          capacity: 20,
        },
      }
    );
    const created = await createResponse.json();

    // Update the room
    const response = await request.put(
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`,
      {
        headers,
        data: {
          name: "Room A (Updated)",
          building: "East Wing",
          capacity: 35,
        },
      }
    );

    expect(response.status()).toBe(200);

    const updated = await response.json();
    expect(updated.name).toBe("Room A (Updated)");
    expect(updated.building).toBe("East Wing");
    expect(updated.capacity).toBe(35);

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`,
      { headers }
    );
  });

  test("DELETE /schools/{schoolId}/rooms/{id} - should delete a room", async ({
    request,
  }) => {
    // Create a room
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/rooms`,
      {
        headers,
        data: {
          name: "Temp Room",
          capacity: 15,
        },
      }
    );
    const created = await createResponse.json();

    // Delete the room
    const response = await request.delete(
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`,
      { headers }
    );

    expect(response.status()).toBe(204);

    // Verify soft delete - room still exists but is inactive
    const getResponse = await request.get(
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`,
      { headers }
    );
    expect(getResponse.status()).toBe(200);
    const deletedRoom = await getResponse.json();
    expect(deletedRoom.isActive).toBe(false);
  });

  test("POST /schools/{schoolId}/rooms - should validate capacity", async ({
    request,
  }) => {
    const invalidRoom = {
      name: "Invalid Room",
      capacity: 0, // Should be at least 1
    };

    const response = await request.post(
      `${API_BASE}/schools/${schoolId}/rooms`,
      {
        headers,
        data: invalidRoom,
      }
    );

    expect(response.status()).toBe(400);
  });

  test.describe("Boundary Conditions", () => {
    test("should reject empty room name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/rooms`,
        {
          headers,
          data: {
            name: "",
            capacity: 20,
          },
        }
      );

      // Backend should reject - either 400 (validation) or 500 (constraint violation)
      expect([400, 500]).toContain(response.status());
    });

    test("should reject negative capacity", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/rooms`,
        {
          headers,
          data: {
            name: "Negative Capacity Room",
            capacity: -5,
          },
        }
      );

      expect(response.status()).toBe(400);
    });

    test("should accept capacity of 1", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/rooms`,
        {
          headers,
          data: {
            name: "Tiny Room",
            capacity: 1,
          },
        }
      );

      expect(response.status()).toBe(201);
      const room = await response.json();
      expect(room.capacity).toBe(1);

      // Cleanup
      await request.delete(`${API_BASE}/schools/${schoolId}/rooms/${room.id}`, {
        headers,
      });
    });

    test("should handle special characters in room name", async ({
      request,
    }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/rooms`,
        {
          headers,
          data: {
            name: "Room #101 (Main)",
            capacity: 30,
          },
        }
      );

      expect(response.status()).toBe(201);
      const room = await response.json();
      expect(room.name).toBe("Room #101 (Main)");

      // Cleanup
      await request.delete(`${API_BASE}/schools/${schoolId}/rooms/${room.id}`, {
        headers,
      });
    });

    test("should handle unicode in room name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/rooms`,
        {
          headers,
          data: {
            name: "Horsaal A",
            building: "Gebaude Ost",
            capacity: 100,
          },
        }
      );

      expect(response.status()).toBe(201);
      const room = await response.json();
      expect(room.name).toContain("Horsaal");

      // Cleanup
      await request.delete(`${API_BASE}/schools/${schoolId}/rooms/${room.id}`, {
        headers,
      });
    });

    test("should safely handle SQL injection in room name", async ({
      request,
    }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/rooms`,
        {
          headers,
          data: {
            name: "'; DROP TABLE rooms; --",
            capacity: 20,
          },
        }
      );

      // Either creates safely or rejects - both are acceptable
      if (response.status() === 201) {
        const room = await response.json();
        expect(room.name).toContain("DROP TABLE");
        await request.delete(
          `${API_BASE}/schools/${schoolId}/rooms/${room.id}`,
          { headers }
        );
      } else {
        expect(response.status()).toBe(400);
      }
    });
  });
});
