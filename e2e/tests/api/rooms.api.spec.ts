import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:8080/api";

test.describe("Rooms API", () => {
  let schoolId: string;

  test.beforeAll(async ({ request }) => {
    // Create a school to use for room tests
    const response = await request.post(`${API_BASE}/schools`, {
      data: {
        name: `Rooms Test School ${Date.now()}`,
        slug: `rooms-test-${Date.now()}`,
        schoolType: "Gymnasium",
        minGrade: 5,
        maxGrade: 13,
      },
    });
    const school = await response.json();
    schoolId = school.id;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup the test school
    if (schoolId) {
      await request.delete(`${API_BASE}/schools/${schoolId}`);
    }
  });

  test("GET /schools/{schoolId}/rooms - should return list of rooms", async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/schools/${schoolId}/rooms`);

    expect(response.ok()).toBeTruthy();
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
        data: newRoom,
      }
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(201);

    const room = await response.json();
    expect(room.id).toBeDefined();
    expect(room.name).toBe(newRoom.name);
    expect(room.building).toBe(newRoom.building);
    expect(room.capacity).toBe(newRoom.capacity);
    expect(room.isActive).toBe(true);
    expect(room.createdAt).toBeDefined();

    // Cleanup
    await request.delete(`${API_BASE}/schools/${schoolId}/rooms/${room.id}`);
  });

  test("GET /schools/{schoolId}/rooms/{id} - should return room details", async ({
    request,
  }) => {
    // Create a room
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/rooms`,
      {
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
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const room = await response.json();
    expect(room.id).toBe(created.id);
    expect(room.name).toBe("Lab 1");
    expect(room.building).toBe("Science Wing");
    expect(room.capacity).toBe(25);

    // Cleanup
    await request.delete(`${API_BASE}/schools/${schoolId}/rooms/${created.id}`);
  });

  test("PUT /schools/{schoolId}/rooms/{id} - should update a room", async ({
    request,
  }) => {
    // Create a room
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/rooms`,
      {
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
        data: {
          name: "Room A (Updated)",
          building: "East Wing",
          capacity: 35,
        },
      }
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const updated = await response.json();
    expect(updated.name).toBe("Room A (Updated)");
    expect(updated.building).toBe("East Wing");
    expect(updated.capacity).toBe(35);

    // Cleanup
    await request.delete(`${API_BASE}/schools/${schoolId}/rooms/${created.id}`);
  });

  test("DELETE /schools/{schoolId}/rooms/{id} - should delete a room", async ({
    request,
  }) => {
    // Create a room
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/rooms`,
      {
        data: {
          name: "Temp Room",
          capacity: 15,
        },
      }
    );
    const created = await createResponse.json();

    // Delete the room
    const response = await request.delete(
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(204);

    // Verify it's gone
    const getResponse = await request.get(
      `${API_BASE}/schools/${schoolId}/rooms/${created.id}`
    );
    expect(getResponse.status()).toBe(404);
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
        data: invalidRoom,
      }
    );

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(400);
  });
});
