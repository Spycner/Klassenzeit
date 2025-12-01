import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:8080/api";

test.describe("Teachers API", () => {
  let schoolId: string;

  test.beforeAll(async ({ request }) => {
    // Create a school to use for teacher tests
    const response = await request.post(`${API_BASE}/schools`, {
      data: {
        name: `Teachers Test School ${Date.now()}`,
        slug: `teachers-test-${Date.now()}`,
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

  test("GET /schools/{schoolId}/teachers - should return list of teachers", async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/teachers`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const teachers = await response.json();
    expect(Array.isArray(teachers)).toBeTruthy();
  });

  test("POST /schools/{schoolId}/teachers - should create a new teacher", async ({
    request,
  }) => {
    const newTeacher = {
      firstName: "John",
      lastName: "Doe",
      email: `john.doe.${Date.now()}@school.com`,
      abbreviation: "DOE",
      maxHoursPerWeek: 25,
      isPartTime: false,
    };

    const response = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        data: newTeacher,
      }
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(201);

    const teacher = await response.json();
    expect(teacher.id).toBeDefined();
    expect(teacher.firstName).toBe(newTeacher.firstName);
    expect(teacher.lastName).toBe(newTeacher.lastName);
    expect(teacher.email).toBe(newTeacher.email);
    expect(teacher.abbreviation).toBe(newTeacher.abbreviation);
    expect(teacher.isActive).toBe(true);
    expect(teacher.createdAt).toBeDefined();

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/teachers/${teacher.id}`
    );
  });

  test("GET /schools/{schoolId}/teachers/{id} - should return teacher details", async ({
    request,
  }) => {
    // Create a teacher
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        data: {
          firstName: "Jane",
          lastName: "Smith",
          email: `jane.smith.${Date.now()}@school.com`,
          abbreviation: "SMI",
        },
      }
    );
    const created = await createResponse.json();

    // Get teacher details
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const teacher = await response.json();
    expect(teacher.id).toBe(created.id);
    expect(teacher.firstName).toBe("Jane");
    expect(teacher.lastName).toBe("Smith");

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`
    );
  });

  test("PUT /schools/{schoolId}/teachers/{id} - should update a teacher", async ({
    request,
  }) => {
    // Create a teacher
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        data: {
          firstName: "Update",
          lastName: "Test",
          email: `update.test.${Date.now()}@school.com`,
          abbreviation: "UPD",
        },
      }
    );
    const created = await createResponse.json();

    // Update the teacher
    const response = await request.put(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`,
      {
        data: {
          firstName: "Updated",
          lastName: "Teacher",
          email: created.email,
          abbreviation: "UPT",
          maxHoursPerWeek: 30,
        },
      }
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const updated = await response.json();
    expect(updated.firstName).toBe("Updated");
    expect(updated.lastName).toBe("Teacher");
    expect(updated.abbreviation).toBe("UPT");

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`
    );
  });

  test("DELETE /schools/{schoolId}/teachers/{id} - should delete a teacher", async ({
    request,
  }) => {
    // Create a teacher
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        data: {
          firstName: "Delete",
          lastName: "Me",
          email: `delete.me.${Date.now()}@school.com`,
          abbreviation: "DEL",
        },
      }
    );
    const created = await createResponse.json();

    // Delete the teacher
    const response = await request.delete(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(204);

    // Verify it's gone
    const getResponse = await request.get(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`
    );
    expect(getResponse.status()).toBe(404);
  });

  test("POST /schools/{schoolId}/teachers - should validate email format", async ({
    request,
  }) => {
    const invalidTeacher = {
      firstName: "Invalid",
      lastName: "Email",
      email: "not-an-email",
      abbreviation: "INV",
    };

    const response = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        data: invalidTeacher,
      }
    );

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(400);
  });
});
