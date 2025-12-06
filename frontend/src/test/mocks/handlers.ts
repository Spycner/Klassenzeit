/**
 * MSW Request Handlers for API Mocking in Tests
 */

import { HttpResponse, http } from "msw";
import type {
  SchoolResponse,
  SchoolSummary,
  SubjectResponse,
  SubjectSummary,
  TeacherResponse,
  TeacherSummary,
  UserSearchResult,
} from "@/api";

// Base URL for API
const API_BASE = "http://localhost:8080";

// Mock data
export const mockSchools: SchoolSummary[] = [
  {
    id: "school-1",
    name: "Test School 1",
    slug: "test-school-1",
    schoolType: "Gymnasium",
  },
  {
    id: "school-2",
    name: "Test School 2",
    slug: "test-school-2",
    schoolType: "Realschule",
  },
];

export const mockSchoolDetail: SchoolResponse = {
  id: "school-1",
  name: "Test School 1",
  slug: "test-school-1",
  schoolType: "Gymnasium",
  minGrade: 5,
  maxGrade: 13,
  timezone: "Europe/Berlin",
  settings: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

export const mockTeachers: TeacherSummary[] = [
  {
    id: "teacher-1",
    firstName: "John",
    lastName: "Doe",
    abbreviation: "DOE",
  },
  {
    id: "teacher-2",
    firstName: "Jane",
    lastName: "Smith",
    abbreviation: "SMI",
  },
];

export const mockTeacherDetail: TeacherResponse = {
  id: "teacher-1",
  firstName: "John",
  lastName: "Doe",
  email: "john.doe@school.com",
  abbreviation: "DOE",
  maxHoursPerWeek: 25,
  isPartTime: false,
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

export const mockSubjects: SubjectSummary[] = [
  {
    id: "subject-1",
    name: "Mathematics",
    abbreviation: "MA",
  },
  {
    id: "subject-2",
    name: "English",
    abbreviation: "EN",
  },
];

export const mockSubjectDetail: SubjectResponse = {
  id: "subject-1",
  name: "Mathematics",
  abbreviation: "MA",
  color: "#3B82F6",
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

export const mockUserSearchResult: UserSearchResult = {
  id: "user-1",
  email: "admin@example.com",
  displayName: "Admin User",
};

// Request handlers
export const handlers = [
  // Schools
  http.get(`${API_BASE}/api/schools`, () => {
    return HttpResponse.json(mockSchools);
  }),

  http.get(`${API_BASE}/api/schools/:id`, ({ params }) => {
    const { id } = params;
    if (id === "school-1") {
      return HttpResponse.json(mockSchoolDetail);
    }
    return new HttpResponse(null, { status: 404 });
  }),

  http.post(`${API_BASE}/api/schools`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      {
        ...mockSchoolDetail,
        ...(body as object),
        id: "new-school-id",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  http.put(`${API_BASE}/api/schools/:id`, async ({ params, request }) => {
    const body = await request.json();
    return HttpResponse.json({
      ...mockSchoolDetail,
      ...(body as object),
      id: params.id,
      updatedAt: new Date().toISOString(),
    });
  }),

  http.delete(`${API_BASE}/api/schools/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Teachers
  http.get(`${API_BASE}/api/schools/:schoolId/teachers`, () => {
    return HttpResponse.json(mockTeachers);
  }),

  http.get(`${API_BASE}/api/schools/:schoolId/teachers/:id`, ({ params }) => {
    const { id } = params;
    if (id === "teacher-1") {
      return HttpResponse.json(mockTeacherDetail);
    }
    return new HttpResponse(null, { status: 404 });
  }),

  http.post(
    `${API_BASE}/api/schools/:schoolId/teachers`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockTeacherDetail,
          ...(body as object),
          id: "new-teacher-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  // Subjects
  http.get(`${API_BASE}/api/schools/:schoolId/subjects`, () => {
    return HttpResponse.json(mockSubjects);
  }),

  http.get(`${API_BASE}/api/schools/:schoolId/subjects/:id`, ({ params }) => {
    const { id } = params;
    if (id === "subject-1") {
      return HttpResponse.json(mockSubjectDetail);
    }
    return new HttpResponse(null, { status: 404 });
  }),

  // User Search
  http.get(`${API_BASE}/api/users/search`, ({ request }) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    if (email === "admin@example.com") {
      return HttpResponse.json(mockUserSearchResult);
    }
    // Return null (200 with null body) for not found
    return HttpResponse.json(null);
  }),
];

// Error handlers for testing error scenarios
export const errorHandlers = {
  serverError: http.get(`${API_BASE}/api/schools`, () => {
    return HttpResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }),

  notFound: http.get(`${API_BASE}/api/schools/:id`, () => {
    return HttpResponse.json({ message: "School not found" }, { status: 404 });
  }),

  validationError: http.post(`${API_BASE}/api/schools`, () => {
    return HttpResponse.json(
      { message: "Validation failed", details: { name: "Name is required" } },
      { status: 400 },
    );
  }),

  rateLimitError: http.get(`${API_BASE}/api/schools`, () => {
    return HttpResponse.json(
      { message: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
  }),

  unauthorized: http.get(`${API_BASE}/api/schools`, () => {
    return HttpResponse.json({ message: "Unauthorized" }, { status: 401 });
  }),

  forbidden: http.get(`${API_BASE}/api/schools`, () => {
    return HttpResponse.json({ message: "Forbidden" }, { status: 403 });
  }),
};
