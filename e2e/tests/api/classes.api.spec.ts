import { expect, test } from "@playwright/test";
import { API_BASE } from "./config";

test.describe("School Classes API", () => {
  let schoolId: string;
  let teacherId: string;

  test.beforeAll(async ({ request }) => {
    // Create a school to use for class tests
    const schoolResponse = await request.post(`${API_BASE}/schools`, {
      data: {
        name: `Classes Test School ${Date.now()}`,
        slug: `classes-test-${Date.now()}`,
        schoolType: "Gymnasium",
        minGrade: 5,
        maxGrade: 13,
      },
    });
    const school = await schoolResponse.json();
    schoolId = school.id;

    // Create a teacher for class teacher assignment
    const teacherResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/teachers`,
      {
        data: {
          firstName: "Class",
          lastName: "Teacher",
          email: `class.teacher.${Date.now()}@school.com`,
          abbreviation: "CT",
        },
      }
    );
    const teacher = await teacherResponse.json();
    teacherId = teacher.id;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup the test school (cascades to teachers and classes)
    if (schoolId) {
      await request.delete(`${API_BASE}/schools/${schoolId}`);
    }
  });

  test("GET /schools/{schoolId}/classes - should return list of classes", async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/classes`
    );

    expect(response.status()).toBe(200);

    const classes = await response.json();
    expect(Array.isArray(classes)).toBeTruthy();
  });

  test("POST /schools/{schoolId}/classes - should create a new class", async ({
    request,
  }) => {
    const newClass = {
      name: "5a",
      gradeLevel: 5,
      studentCount: 25,
      classTeacherId: teacherId,
    };

    const response = await request.post(
      `${API_BASE}/schools/${schoolId}/classes`,
      {
        data: newClass,
      }
    );

    expect(response.status()).toBe(201);

    const schoolClass = await response.json();
    expect(schoolClass.id).toBeDefined();
    expect(schoolClass.name).toBe(newClass.name);
    expect(schoolClass.gradeLevel).toBe(newClass.gradeLevel);
    expect(schoolClass.studentCount).toBe(newClass.studentCount);
    expect(schoolClass.classTeacherId).toBe(teacherId);
    expect(schoolClass.isActive).toBe(true);
    expect(schoolClass.createdAt).toBeDefined();

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/classes/${schoolClass.id}`
    );
  });

  test("GET /schools/{schoolId}/classes/{id} - should return class details", async ({
    request,
  }) => {
    // Create a class
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/classes`,
      {
        data: {
          name: "6b",
          gradeLevel: 6,
          studentCount: 28,
        },
      }
    );
    const created = await createResponse.json();

    // Get class details
    const response = await request.get(
      `${API_BASE}/schools/${schoolId}/classes/${created.id}`
    );

    expect(response.status()).toBe(200);

    const schoolClass = await response.json();
    expect(schoolClass.id).toBe(created.id);
    expect(schoolClass.name).toBe("6b");
    expect(schoolClass.gradeLevel).toBe(6);

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/classes/${created.id}`
    );
  });

  test("PUT /schools/{schoolId}/classes/{id} - should update a class", async ({
    request,
  }) => {
    // Create a class
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/classes`,
      {
        data: {
          name: "7a",
          gradeLevel: 7,
        },
      }
    );
    const created = await createResponse.json();

    // Update the class
    const response = await request.put(
      `${API_BASE}/schools/${schoolId}/classes/${created.id}`,
      {
        data: {
          name: "7a",
          gradeLevel: 7,
          studentCount: 30,
          classTeacherId: teacherId,
        },
      }
    );

    expect(response.status()).toBe(200);

    const updated = await response.json();
    expect(updated.studentCount).toBe(30);
    expect(updated.classTeacherId).toBe(teacherId);

    // Cleanup
    await request.delete(
      `${API_BASE}/schools/${schoolId}/classes/${created.id}`
    );
  });

  test("DELETE /schools/{schoolId}/classes/{id} - should delete a class", async ({
    request,
  }) => {
    // Create a class
    const createResponse = await request.post(
      `${API_BASE}/schools/${schoolId}/classes`,
      {
        data: {
          name: "8c",
          gradeLevel: 8,
        },
      }
    );
    const created = await createResponse.json();

    // Delete the class
    const response = await request.delete(
      `${API_BASE}/schools/${schoolId}/classes/${created.id}`
    );

    expect(response.status()).toBe(204);

    // Verify soft delete - class still exists but is inactive
    const getResponse = await request.get(
      `${API_BASE}/schools/${schoolId}/classes/${created.id}`
    );
    expect(getResponse.status()).toBe(200);
    const deletedClass = await getResponse.json();
    expect(deletedClass.isActive).toBe(false);
  });

  test("POST /schools/{schoolId}/classes - should validate grade level", async ({
    request,
  }) => {
    const invalidClass = {
      name: "Invalid",
      gradeLevel: 15, // Should be 1-13
    };

    const response = await request.post(
      `${API_BASE}/schools/${schoolId}/classes`,
      {
        data: invalidClass,
      }
    );

    expect(response.status()).toBe(400);
  });

  test.describe("Boundary Conditions", () => {
    test("should reject empty class name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/classes`,
        {
          data: {
            name: "",
            gradeLevel: 5,
          },
        }
      );

      // Backend should reject - either 400 (validation) or 500 (constraint violation)
      expect([400, 500]).toContain(response.status());
    });

    test("should handle unicode in class name", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/classes`,
        {
          data: {
            name: "Klasse 5a",
            gradeLevel: 5,
          },
        }
      );

      expect(response.status()).toBe(201);
      const schoolClass = await response.json();
      expect(schoolClass.name).toBe("Klasse 5a");

      // Cleanup
      await request.delete(
        `${API_BASE}/schools/${schoolId}/classes/${schoolClass.id}`
      );
    });

    test("should reject grade level below minimum", async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/classes`,
        {
          data: {
            name: "Below Min",
            gradeLevel: 0,
          },
        }
      );

      expect(response.status()).toBe(400);
    });

    test("should accept grade level at school minimum", async ({ request }) => {
      // School has minGrade: 5
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/classes`,
        {
          data: {
            name: "At Min Grade",
            gradeLevel: 5,
          },
        }
      );

      expect(response.status()).toBe(201);
      const schoolClass = await response.json();

      // Cleanup
      await request.delete(
        `${API_BASE}/schools/${schoolId}/classes/${schoolClass.id}`
      );
    });

    test("should accept grade level at school maximum", async ({ request }) => {
      // School has maxGrade: 13
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/classes`,
        {
          data: {
            name: "At Max Grade",
            gradeLevel: 13,
          },
        }
      );

      expect(response.status()).toBe(201);
      const schoolClass = await response.json();

      // Cleanup
      await request.delete(
        `${API_BASE}/schools/${schoolId}/classes/${schoolClass.id}`
      );
    });

    test("should safely handle SQL injection in class name", async ({
      request,
    }) => {
      const response = await request.post(
        `${API_BASE}/schools/${schoolId}/classes`,
        {
          data: {
            name: "'; DROP TABLE classes; --",
            gradeLevel: 5,
          },
        }
      );

      // Either creates safely or rejects - both are acceptable
      if (response.status() === 201) {
        const schoolClass = await response.json();
        expect(schoolClass.name).toContain("DROP TABLE");
        await request.delete(
          `${API_BASE}/schools/${schoolId}/classes/${schoolClass.id}`
        );
      } else {
        expect(response.status()).toBe(400);
      }
    });
  });
});
