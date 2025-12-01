import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:8080/api";

test.describe("Schools API", () => {
  let createdSchoolId: string;

  test("GET /schools - should return list of schools", async ({ request }) => {
    const response = await request.get(`${API_BASE}/schools`);

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const schools = await response.json();
    expect(Array.isArray(schools)).toBeTruthy();

    // Verify structure of school summary
    if (schools.length > 0) {
      const school = schools[0];
      expect(school).toHaveProperty("id");
      expect(school).toHaveProperty("name");
      expect(school).toHaveProperty("slug");
      expect(school).toHaveProperty("schoolType");
    }
  });

  test("POST /schools - should create a new school", async ({ request }) => {
    const newSchool = {
      name: `Test School ${Date.now()}`,
      slug: `test-school-${Date.now()}`,
      schoolType: "Gymnasium",
      minGrade: 5,
      maxGrade: 13,
      timezone: "Europe/Berlin",
    };

    const response = await request.post(`${API_BASE}/schools`, {
      data: newSchool,
    });

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(201);

    const school = await response.json();
    expect(school.id).toBeDefined();
    expect(school.name).toBe(newSchool.name);
    expect(school.slug).toBe(newSchool.slug);
    expect(school.schoolType).toBe(newSchool.schoolType);
    expect(school.minGrade).toBe(newSchool.minGrade);
    expect(school.maxGrade).toBe(newSchool.maxGrade);
    expect(school.createdAt).toBeDefined();
    expect(school.updatedAt).toBeDefined();

    // Store for subsequent tests
    createdSchoolId = school.id;
  });

  test("GET /schools/{id} - should return school details", async ({
    request,
  }) => {
    // First create a school
    const newSchool = {
      name: `Detail Test School ${Date.now()}`,
      slug: `detail-test-${Date.now()}`,
      schoolType: "Realschule",
      minGrade: 5,
      maxGrade: 10,
    };

    const createResponse = await request.post(`${API_BASE}/schools`, {
      data: newSchool,
    });
    const created = await createResponse.json();

    // Then get it by ID
    const response = await request.get(`${API_BASE}/schools/${created.id}`);

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const school = await response.json();
    expect(school.id).toBe(created.id);
    expect(school.name).toBe(newSchool.name);
    expect(school.slug).toBe(newSchool.slug);

    // Cleanup
    await request.delete(`${API_BASE}/schools/${created.id}`);
  });

  test("PUT /schools/{id} - should update a school", async ({ request }) => {
    // First create a school
    const newSchool = {
      name: `Update Test School ${Date.now()}`,
      slug: `update-test-${Date.now()}`,
      schoolType: "Grundschule",
      minGrade: 1,
      maxGrade: 4,
    };

    const createResponse = await request.post(`${API_BASE}/schools`, {
      data: newSchool,
    });
    const created = await createResponse.json();

    // Update it
    const updateData = {
      ...newSchool,
      name: "Updated School Name",
      maxGrade: 6,
    };

    const response = await request.put(`${API_BASE}/schools/${created.id}`, {
      data: updateData,
    });

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const updated = await response.json();
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Updated School Name");
    expect(updated.maxGrade).toBe(6);

    // Cleanup
    await request.delete(`${API_BASE}/schools/${created.id}`);
  });

  test("DELETE /schools/{id} - should delete a school", async ({ request }) => {
    // First create a school
    const newSchool = {
      name: `Delete Test School ${Date.now()}`,
      slug: `delete-test-${Date.now()}`,
      schoolType: "Gymnasium",
      minGrade: 5,
      maxGrade: 13,
    };

    const createResponse = await request.post(`${API_BASE}/schools`, {
      data: newSchool,
    });
    const created = await createResponse.json();

    // Delete it
    const response = await request.delete(`${API_BASE}/schools/${created.id}`);

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(204);

    // Verify it's gone
    const getResponse = await request.get(`${API_BASE}/schools/${created.id}`);
    expect(getResponse.status()).toBe(404);
  });

  test("POST /schools - should validate required fields", async ({
    request,
  }) => {
    const invalidSchool = {
      // Missing required fields
      name: "Test",
    };

    const response = await request.post(`${API_BASE}/schools`, {
      data: invalidSchool,
    });

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(400);
  });

  test("GET /schools/{id} - should return 404 for non-existent school", async ({
    request,
  }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const response = await request.get(`${API_BASE}/schools/${fakeId}`);

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(404);
  });
});
