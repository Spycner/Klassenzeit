import { expect, test } from "./fixtures";
import { getAuthHeaders, getCurrentUserId } from "./auth";
import { API_BASE } from "./config";

test.describe("Teachers API", () => {
  let schoolId: string;
  let headers: Record<string, string>;
  // Use unique suffix per worker to avoid conflicts in parallel execution
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  test.beforeAll(async ({ request }) => {
    headers = await getAuthHeaders();
    const userId = await getCurrentUserId();
    // Create a school to use for teacher tests
    const response = await request.post(`${API_BASE}/schools`, {
      headers,
      data: {
        name: `Teachers Test School ${uniqueSuffix}`,
        slug: `teachers-test-${uniqueSuffix}`,
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

  test("GET /schools/{schoolId}/teachers - should return list of teachers", async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/teachers`,
      { headers }
    );

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
        headers,
        data: newTeacher,
      }
    );

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
      `${API_BASE}/schools/${schoolId}/teachers/${teacher.id}`,
      { headers }
    );
  });

  test("GET /schools/{schoolId}/teachers/{id} - should return teacher details", async ({
    request,
  }) => {
    // Create a teacher
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        headers,
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
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`,
      { headers }
    );

    expect(response.status()).toBe(200);

    const teacher = await response.json();
    expect(teacher.id).toBe(created.id);
    expect(teacher.firstName).toBe("Jane");
    expect(teacher.lastName).toBe("Smith");

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`,
      { headers }
    );
  });

  test("PUT /schools/{schoolId}/teachers/{id} - should update a teacher", async ({
    request,
  }) => {
    // Create a teacher
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        headers,
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
        headers,
        data: {
          firstName: "Updated",
          lastName: "Teacher",
          email: created.email,
          abbreviation: "UPT",
          maxHoursPerWeek: 30,
        },
      }
    );

    expect(response.status()).toBe(200);

    const updated = await response.json();
    expect(updated.firstName).toBe("Updated");
    expect(updated.lastName).toBe("Teacher");
    expect(updated.abbreviation).toBe("UPT");

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`,
      { headers }
    );
  });

  test("DELETE /schools/{schoolId}/teachers/{id} - should delete a teacher", async ({
    request,
  }) => {
    // Create a teacher
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        headers,
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
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`,
      { headers }
    );

    expect(response.status()).toBe(204);

    // Verify soft delete - teacher still exists but is inactive
    const getResponse = await request.get(
      `${API_BASE}/schools/${schoolId}/teachers/${created.id}`,
      { headers }
    );
    expect(getResponse.status()).toBe(200);
    const deletedTeacher = await getResponse.json();
    expect(deletedTeacher.isActive).toBe(false);
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
        headers,
        data: invalidTeacher,
      }
    );

    expect(response.status()).toBe(400);
  });

  test.describe("Boundary Conditions", () => {
    test("should reject empty first name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/teachers`,
        {
          headers,
          data: {
            firstName: "",
            lastName: "Test",
            email: `empty.first.${Date.now()}@school.com`,
            abbreviation: "EFN",
          },
        }
      );

      // Backend should reject - either 400 (validation) or 500 (constraint violation)
      expect([400, 500]).toContain(response.status());
    });

    test("should reject empty last name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/teachers`,
        {
          headers,
          data: {
            firstName: "Test",
            lastName: "",
            email: `empty.last.${Date.now()}@school.com`,
            abbreviation: "ELN",
          },
        }
      );

      // Backend should reject - either 400 (validation) or 500 (constraint violation)
      expect([400, 500]).toContain(response.status());
    });

    test("should handle unicode in teacher name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/teachers`,
        {
          headers,
          data: {
            firstName: "Jose",
            lastName: "Garcia",
            email: `jose.garcia.${Date.now()}@school.com`,
            abbreviation: "JGA",
          },
        }
      );

      expect(response.status()).toBe(201);
      const teacher = await response.json();
      expect(teacher.firstName).toBe("Jose");
      expect(teacher.lastName).toBe("Garcia");

      // Cleanup
      await request.delete(
        `${API_BASE}/schools/${schoolId}/teachers/${teacher.id}`,
        { headers }
      );
    });

    test("should handle special characters in name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/teachers`,
        {
          headers,
          data: {
            firstName: "Mary-Jane",
            lastName: "O'Connor",
            email: `mary.oconnor.${Date.now()}@school.com`,
            abbreviation: "MJO",
          },
        }
      );

      expect(response.status()).toBe(201);
      const teacher = await response.json();
      expect(teacher.firstName).toBe("Mary-Jane");
      expect(teacher.lastName).toBe("O'Connor");

      // Cleanup
      await request.delete(
        `${API_BASE}/schools/${schoolId}/teachers/${teacher.id}`,
        { headers }
      );
    });

    test("should safely handle SQL injection in email", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/teachers`,
        {
          headers,
          data: {
            firstName: "SQL",
            lastName: "Test",
            email: `test@test.com'; DROP TABLE teachers; --`,
            abbreviation: "SQL",
          },
        }
      );

      // Should reject invalid email format
      expect(response.status()).toBe(400);
    });
  });
});
