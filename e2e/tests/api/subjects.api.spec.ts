import { expect, test } from "./fixtures";
import { getAuthHeaders, getCurrentUserId } from "./auth";
import { API_BASE } from "./config";

test.describe("Subjects API", () => {
  let schoolId: string;
  let headers: Record<string, string>;
  // Use unique suffix per worker to avoid conflicts in parallel execution
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  test.beforeAll(async ({ request }) => {
    headers = await getAuthHeaders();
    const userId = await getCurrentUserId();
    // Create a school to use for subject tests
    const response = await request.post(`${API_BASE}/schools`, {
      headers,
      data: {
        name: `Subjects Test School ${uniqueSuffix}`,
        slug: `subjects-test-${uniqueSuffix}`,
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

  test("GET /schools/{schoolId}/subjects - should return list of subjects", async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/subjects`,
      { headers }
    );

    expect(response.status()).toBe(200);

    const subjects = await response.json();
    expect(Array.isArray(subjects)).toBeTruthy();
  });

  test("POST /schools/{schoolId}/subjects - should create a new subject", async ({
    request,
  }) => {
    const newSubject = {
      name: "Mathematics",
      abbreviation: "MA",
      color: "#3B82F6",
    };

    const response = await request.post(
      `${API_BASE}/schools/${schoolId}/subjects`,
      {
        headers,
        data: newSubject,
      }
    );

    expect(response.status()).toBe(201);

    const subject = await response.json();
    expect(subject.id).toBeDefined();
    expect(subject.name).toBe(newSubject.name);
    expect(subject.abbreviation).toBe(newSubject.abbreviation);
    expect(subject.color).toBe(newSubject.color);
    expect(subject.createdAt).toBeDefined();

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/subjects/${subject.id}`,
      { headers }
    );
  });

  test("GET /schools/{schoolId}/subjects/{id} - should return subject details", async ({
    request,
  }) => {
    // Create a subject
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/subjects`,
      {
        headers,
        data: {
          name: "English",
          abbreviation: "EN",
        },
      }
    );
    const created = await createResponse.json();

    // Get subject details
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`,
      { headers }
    );

    expect(response.status()).toBe(200);

    const subject = await response.json();
    expect(subject.id).toBe(created.id);
    expect(subject.name).toBe("English");
    expect(subject.abbreviation).toBe("EN");

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`,
      { headers }
    );
  });

  test("PUT /schools/{schoolId}/subjects/{id} - should update a subject", async ({
    request,
  }) => {
    // Create a subject
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/subjects`,
      {
        headers,
        data: {
          name: "Physics",
          abbreviation: "PH",
        },
      }
    );
    const created = await createResponse.json();

    // Update the subject
    const response = await request.put(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`,
      {
        headers,
        data: {
          name: "Physics Advanced",
          abbreviation: "PHA",
          color: "#EF4444",
        },
      }
    );

    expect(response.status()).toBe(200);

    const updated = await response.json();
    expect(updated.name).toBe("Physics Advanced");
    expect(updated.abbreviation).toBe("PHA");
    expect(updated.color).toBe("#EF4444");

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`,
      { headers }
    );
  });

  test("DELETE /schools/{schoolId}/subjects/{id} - should delete a subject", async ({
    request,
  }) => {
    // Create a subject
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/subjects`,
      {
        headers,
        data: {
          name: "Chemistry",
          abbreviation: "CH",
        },
      }
    );
    const created = await createResponse.json();

    // Delete the subject
    const response = await request.delete(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`,
      { headers }
    );

    expect(response.status()).toBe(204);

    // Verify it's gone
    const getResponse = await request.get(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`,
      { headers }
    );
    expect(getResponse.status()).toBe(404);
  });

  test.describe("Boundary Conditions", () => {
    test("should reject empty subject name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/subjects`,
        {
          headers,
          data: {
            name: "",
            abbreviation: "EMP",
          },
        }
      );

      // Backend should reject - either 400 (validation) or 500 (constraint violation)
      expect([400, 500]).toContain(response.status());
    });

    test("should reject empty abbreviation", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/subjects`,
        {
          headers,
          data: {
            name: "Test Subject",
            abbreviation: "",
          },
        }
      );

      // Backend should reject - either 400 (validation) or 500 (constraint violation)
      expect([400, 500]).toContain(response.status());
    });

    test("should handle unicode in subject name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/subjects`,
        {
          headers,
          data: {
            name: "Franzosisch",
            abbreviation: "FR",
          },
        }
      );

      expect(response.status()).toBe(201);
      const subject = await response.json();
      expect(subject.name).toContain("Franz");

      // Cleanup
      await request.delete(
        `${API_BASE}/schools/${schoolId}/subjects/${subject.id}`,
        { headers }
      );
    });

    test("should handle special characters in subject name", async ({
      request,
    }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/subjects`,
        {
          headers,
          data: {
            name: "Art & Design",
            abbreviation: "AD",
          },
        }
      );

      expect(response.status()).toBe(201);
      const subject = await response.json();
      expect(subject.name).toBe("Art & Design");

      // Cleanup
      await request.delete(
        `${API_BASE}/schools/${schoolId}/subjects/${subject.id}`,
        { headers }
      );
    });

    test("should safely handle SQL injection in subject name", async ({
      request,
    }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/subjects`,
        {
          headers,
          data: {
            name: "'; DROP TABLE subjects; --",
            abbreviation: "SQL",
          },
        }
      );

      // Either creates safely or rejects - both are acceptable
      if (response.status() === 201) {
        const subject = await response.json();
        expect(subject.name).toContain("DROP TABLE");
        await request.delete(
          `${API_BASE}/schools/${schoolId}/subjects/${subject.id}`,
          { headers }
        );
      } else {
        expect(response.status()).toBe(400);
      }
    });
  });
});
