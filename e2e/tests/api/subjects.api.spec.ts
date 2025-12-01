import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:8080/api";

test.describe("Subjects API", () => {
  let schoolId: string;

  test.beforeAll(async ({ request }) => {
    // Create a school to use for subject tests
    const response = await request.post(`${API_BASE}/schools`, {
      data: {
        name: `Subjects Test School ${Date.now()}`,
        slug: `subjects-test-${Date.now()}`,
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

  test("GET /schools/{schoolId}/subjects - should return list of subjects", async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/subjects`
    );

    expect(response.ok()).toBeTruthy();
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
        data: newSubject,
      }
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(201);

    const subject = await response.json();
    expect(subject.id).toBeDefined();
    expect(subject.name).toBe(newSubject.name);
    expect(subject.abbreviation).toBe(newSubject.abbreviation);
    expect(subject.color).toBe(newSubject.color);
    expect(subject.isActive).toBe(true);
    expect(subject.createdAt).toBeDefined();

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/subjects/${subject.id}`
    );
  });

  test("GET /schools/{schoolId}/subjects/{id} - should return subject details", async ({
    request,
  }) => {
    // Create a subject
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/subjects`,
      {
        data: {
          name: "English",
          abbreviation: "EN",
        },
      }
    );
    const created = await createResponse.json();

    // Get subject details
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const subject = await response.json();
    expect(subject.id).toBe(created.id);
    expect(subject.name).toBe("English");
    expect(subject.abbreviation).toBe("EN");

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`
    );
  });

  test("PUT /schools/{schoolId}/subjects/{id} - should update a subject", async ({
    request,
  }) => {
    // Create a subject
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/subjects`,
      {
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
        data: {
          name: "Physics Advanced",
          abbreviation: "PHA",
          color: "#EF4444",
        },
      }
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const updated = await response.json();
    expect(updated.name).toBe("Physics Advanced");
    expect(updated.abbreviation).toBe("PHA");
    expect(updated.color).toBe("#EF4444");

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`
    );
  });

  test("DELETE /schools/{schoolId}/subjects/{id} - should delete a subject", async ({
    request,
  }) => {
    // Create a subject
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/subjects`,
      {
        data: {
          name: "Chemistry",
          abbreviation: "CH",
        },
      }
    );
    const created = await createResponse.json();

    // Delete the subject
    const response = await request.delete(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(204);

    // Verify it's gone
    const getResponse = await request.get(
      `${API_BASE}/schools/${schoolId}/subjects/${created.id}`
    );
    expect(getResponse.status()).toBe(404);
  });
});
