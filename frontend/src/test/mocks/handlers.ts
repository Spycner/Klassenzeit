/**
 * MSW Request Handlers for API Mocking in Tests
 */

import { HttpResponse, http } from "msw";
import type {
  LessonResponse,
  LessonSummary,
  MembershipResponse,
  MembershipSummary,
  RoomResponse,
  RoomSubjectSuitabilitySummary,
  RoomSummary,
  SchoolClassResponse,
  SchoolClassSummary,
  SchoolResponse,
  SchoolSummary,
  SchoolYearResponse,
  SchoolYearSummary,
  SubjectResponse,
  SubjectSummary,
  TeacherResponse,
  TeacherSummary,
  TermResponse,
  TermSummary,
  TimeSlotResponse,
  TimeSlotSummary,
  UserSearchResult,
} from "@/api";
import type {
  AccessRequestResponse,
  AccessRequestSummary,
} from "@/api/services/access-requests";
import type { UserProfile } from "@/auth/types";

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
    isActive: true,
  },
  {
    id: "teacher-2",
    firstName: "Jane",
    lastName: "Smith",
    abbreviation: "SMI",
    isActive: true,
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

// Qualifications mock data
export const mockQualifications = [
  {
    id: "qual-1",
    subjectId: "subject-1",
    subjectName: "Mathematics",
    subjectAbbreviation: "MA",
    isPrimary: true,
  },
  {
    id: "qual-2",
    subjectId: "subject-2",
    subjectName: "English",
    subjectAbbreviation: "EN",
    isPrimary: false,
  },
];

export const mockQualificationDetail = {
  id: "qual-1",
  subjectId: "subject-1",
  subjectName: "Mathematics",
  subjectAbbreviation: "MA",
  isPrimary: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Availability mock data
export const mockAvailability = [
  {
    id: "avail-1",
    timeSlotId: "timeslot-1",
    dayOfWeek: "MONDAY",
    startTime: "08:00",
    endTime: "09:00",
    type: "AVAILABLE",
  },
  {
    id: "avail-2",
    timeSlotId: "timeslot-2",
    dayOfWeek: "MONDAY",
    startTime: "09:00",
    endTime: "10:00",
    type: "PREFERRED",
  },
];

export const mockAvailabilityDetail = {
  id: "avail-1",
  timeSlotId: "timeslot-1",
  dayOfWeek: "MONDAY",
  startTime: "08:00",
  endTime: "09:00",
  type: "AVAILABLE",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

export const mockSubjects: SubjectSummary[] = [
  {
    id: "subject-1",
    name: "Mathematics",
    abbreviation: "MA",
    needsSpecialRoom: true, // Special room subject for testing
  },
  {
    id: "subject-2",
    name: "English",
    abbreviation: "EN",
    needsSpecialRoom: true, // Special room subject for testing
  },
];

export const mockSubjectDetail: SubjectResponse = {
  id: "subject-1",
  name: "Mathematics",
  abbreviation: "MA",
  color: "#3B82F6",
  needsSpecialRoom: false,
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

export const mockUserSearchResult: UserSearchResult = {
  id: "user-1",
  email: "admin@example.com",
  displayName: "Admin User",
};

export const mockCurrentUser: UserProfile = {
  id: "user-1",
  email: "test@example.com",
  displayName: "Test User",
  isPlatformAdmin: false,
  schools: [
    {
      schoolId: "school-1",
      schoolName: "Test School 1",
      role: "SCHOOL_ADMIN",
    },
  ],
};

// Classes mock data
export const mockClasses: SchoolClassSummary[] = [
  { id: "class-1", name: "5a", gradeLevel: 5, isActive: true },
  { id: "class-2", name: "6b", gradeLevel: 6, isActive: true },
  { id: "class-3", name: "7c", gradeLevel: 7, isActive: true },
];

// Class teacher assignments mock data (classes assigned to teacher-1)
export const mockClassTeacherAssignments: SchoolClassSummary[] = [
  { id: "class-1", name: "5a", gradeLevel: 5, isActive: true },
];

export const mockClassDetail: SchoolClassResponse = {
  id: "class-1",
  name: "5a",
  gradeLevel: 5,
  studentCount: 25,
  classTeacherId: "teacher-1",
  classTeacherName: "John Doe",
  isActive: true,
  version: 1,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Rooms mock data
export const mockRooms: RoomSummary[] = [
  {
    id: "room-1",
    name: "Room 101",
    building: "Main",
    capacity: 30,
    isActive: true,
  },
  {
    id: "room-2",
    name: "Room 102",
    building: "Main",
    capacity: 25,
    isActive: true,
  },
];

export const mockRoomDetail: RoomResponse = {
  id: "room-1",
  name: "Room 101",
  building: "Main",
  capacity: 30,
  features: "Projector, Whiteboard",
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Room Subject Suitabilities mock data
export const mockRoomSubjects: RoomSubjectSuitabilitySummary[] = [
  {
    id: "suit-1",
    subjectId: "subject-1",
    subjectName: "Mathematics",
    subjectColor: "#3B82F6",
  },
  {
    id: "suit-2",
    subjectId: "subject-2",
    subjectName: "English",
    subjectColor: "#10B981",
  },
];

export const mockRoomSubjectDetail: RoomSubjectSuitabilitySummary = {
  id: "suit-1",
  subjectId: "subject-1",
  subjectName: "Mathematics",
  subjectColor: "#3B82F6",
};

// School Years mock data
export const mockSchoolYears: SchoolYearSummary[] = [
  {
    id: "year-1",
    name: "2024/2025",
    startDate: "2024-08-01",
    endDate: "2025-07-31",
    isCurrent: true,
  },
  {
    id: "year-2",
    name: "2023/2024",
    startDate: "2023-08-01",
    endDate: "2024-07-31",
    isCurrent: false,
  },
];

export const mockSchoolYearDetail: SchoolYearResponse = {
  id: "year-1",
  name: "2024/2025",
  startDate: "2024-08-01",
  endDate: "2025-07-31",
  isCurrent: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Terms mock data
export const mockTerms: TermSummary[] = [
  {
    id: "term-1",
    name: "1. Semester",
    startDate: "2024-08-01",
    endDate: "2025-01-31",
    isCurrent: true,
  },
  {
    id: "term-2",
    name: "2. Semester",
    startDate: "2025-02-01",
    endDate: "2025-07-31",
    isCurrent: false,
  },
];

export const mockTermDetail: TermResponse = {
  id: "term-1",
  name: "1. Semester",
  startDate: "2024-08-01",
  endDate: "2025-01-31",
  isCurrent: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Time Slots mock data
export const mockTimeSlots: TimeSlotSummary[] = [
  {
    id: "slot-1",
    dayOfWeek: 0,
    period: 1,
    startTime: "08:00",
    endTime: "08:45",
  },
  {
    id: "slot-2",
    dayOfWeek: 0,
    period: 2,
    startTime: "08:50",
    endTime: "09:35",
  },
];

export const mockTimeSlotDetail: TimeSlotResponse = {
  id: "slot-1",
  dayOfWeek: 0,
  period: 1,
  startTime: "08:00",
  endTime: "08:45",
  isBreak: false,
  label: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Lessons mock data
export const mockLessons: LessonSummary[] = [
  {
    id: "lesson-1",
    schoolClassName: "5a",
    teacherName: "John Doe",
    subjectName: "Mathematics",
    roomName: "Room 101",
  },
  {
    id: "lesson-2",
    schoolClassName: "5a",
    teacherName: "Jane Smith",
    subjectName: "English",
    roomName: "Room 102",
  },
];

export const mockLessonDetail: LessonResponse = {
  id: "lesson-1",
  schoolClassId: "class-1",
  schoolClassName: "5a",
  teacherId: "teacher-1",
  teacherName: "John Doe",
  subjectId: "subject-1",
  subjectName: "Mathematics",
  timeslotId: "slot-1",
  dayOfWeek: 0,
  period: 1,
  startTime: "08:00",
  endTime: "08:45",
  roomId: "room-1",
  roomName: "Room 101",
  weekPattern: "EVERY",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Memberships mock data
export const mockMemberships: MembershipSummary[] = [
  {
    id: "membership-1",
    userId: "user-1",
    userDisplayName: "Test User",
    userEmail: "test@example.com",
    role: "SCHOOL_ADMIN",
    isActive: true,
  },
  {
    id: "membership-2",
    userId: "user-2",
    userDisplayName: "Teacher User",
    userEmail: "teacher@example.com",
    role: "TEACHER",
    isActive: true,
  },
];

export const mockMembershipDetail: MembershipResponse = {
  id: "membership-1",
  userId: "user-1",
  userDisplayName: "Test User",
  userEmail: "test@example.com",
  schoolId: "school-1",
  role: "SCHOOL_ADMIN",
  linkedTeacherId: null,
  linkedTeacherName: null,
  isActive: true,
  grantedById: "user-1",
  grantedByName: "Test User",
  grantedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Access Requests mock data
export const mockAccessRequests: AccessRequestSummary[] = [
  {
    id: "request-1",
    userDisplayName: "New User",
    userEmail: "newuser@example.com",
    requestedRole: "TEACHER",
    status: "PENDING",
    createdAt: "2024-01-15T00:00:00Z",
  },
];

export const mockAccessRequestDetail: AccessRequestResponse = {
  id: "request-1",
  userId: "user-3",
  userDisplayName: "New User",
  userEmail: "newuser@example.com",
  schoolId: "school-1",
  schoolName: "Test School 1",
  requestedRole: "TEACHER",
  status: "PENDING",
  message: "I would like to join as a teacher.",
  responseMessage: null,
  reviewedById: null,
  reviewedByName: null,
  reviewedAt: null,
  createdAt: "2024-01-15T00:00:00Z",
  updatedAt: "2024-01-15T00:00:00Z",
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

  // Update teacher
  http.put(
    `${API_BASE}/api/schools/:schoolId/teachers/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockTeacherDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  // Soft delete teacher
  http.delete(`${API_BASE}/api/schools/:schoolId/teachers/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Permanent delete teacher
  http.delete(
    `${API_BASE}/api/schools/:schoolId/teachers/:id/permanent`,
    () => {
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // Class teacher assignments
  http.get(
    `${API_BASE}/api/schools/:schoolId/teachers/:id/class-teacher-assignments`,
    () => {
      return HttpResponse.json(mockClassTeacherAssignments);
    },
  ),

  // Qualifications
  http.get(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/qualifications`,
    () => {
      return HttpResponse.json(mockQualifications);
    },
  ),

  http.get(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/qualifications/:id`,
    ({ params }) => {
      const { id } = params;
      if (id === "qual-1") {
        return HttpResponse.json(mockQualificationDetail);
      }
      return new HttpResponse(null, { status: 404 });
    },
  ),

  http.post(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/qualifications`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockQualificationDetail,
          ...(body as object),
          id: "new-qual-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/qualifications/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockQualificationDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/qualifications/:id`,
    () => {
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // Availability
  http.get(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/availability`,
    () => {
      return HttpResponse.json(mockAvailability);
    },
  ),

  http.get(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/availability/:id`,
    ({ params }) => {
      const { id } = params;
      if (id === "avail-1") {
        return HttpResponse.json(mockAvailabilityDetail);
      }
      return new HttpResponse(null, { status: 404 });
    },
  ),

  http.post(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/availability`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockAvailabilityDetail,
          ...(body as object),
          id: "new-avail-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/availability/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockAvailabilityDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(
    `${API_BASE}/api/schools/:schoolId/teachers/:teacherId/availability/:id`,
    () => {
      return new HttpResponse(null, { status: 204 });
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
    const query = url.searchParams.get("query");
    if (query && "admin".includes(query.toLowerCase())) {
      return HttpResponse.json([mockUserSearchResult]);
    }
    // Return empty array for not found
    return HttpResponse.json([]);
  }),

  // Current User
  http.get(`${API_BASE}/api/users/me`, () => {
    return HttpResponse.json(mockCurrentUser);
  }),

  // Classes
  http.get(`${API_BASE}/api/schools/:schoolId/classes`, () => {
    return HttpResponse.json(mockClasses);
  }),

  http.get(`${API_BASE}/api/schools/:schoolId/classes/:id`, ({ params }) => {
    const { id } = params;
    if (id === "class-1") {
      return HttpResponse.json(mockClassDetail);
    }
    return new HttpResponse(null, { status: 404 });
  }),

  http.post(
    `${API_BASE}/api/schools/:schoolId/classes`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockClassDetail,
          ...(body as object),
          id: "new-class-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/classes/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockClassDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(`${API_BASE}/api/schools/:schoolId/classes/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Rooms
  http.get(`${API_BASE}/api/schools/:schoolId/rooms`, () => {
    return HttpResponse.json(mockRooms);
  }),

  http.get(`${API_BASE}/api/schools/:schoolId/rooms/:id`, ({ params }) => {
    const { id } = params;
    if (id === "room-1") {
      return HttpResponse.json(mockRoomDetail);
    }
    return new HttpResponse(null, { status: 404 });
  }),

  http.post(`${API_BASE}/api/schools/:schoolId/rooms`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      {
        ...mockRoomDetail,
        ...(body as object),
        id: "new-room-id",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  http.put(
    `${API_BASE}/api/schools/:schoolId/rooms/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockRoomDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(`${API_BASE}/api/schools/:schoolId/rooms/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Room Subject Suitabilities
  http.get(`${API_BASE}/api/schools/:schoolId/rooms/:roomId/subjects`, () => {
    return HttpResponse.json(mockRoomSubjects);
  }),

  http.post(
    `${API_BASE}/api/schools/:schoolId/rooms/:roomId/subjects`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockRoomSubjectDetail,
          ...(body as object),
          id: "new-suit-id",
        },
        { status: 201 },
      );
    },
  ),

  http.delete(
    `${API_BASE}/api/schools/:schoolId/rooms/:roomId/subjects/:id`,
    () => {
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // School Years
  http.get(`${API_BASE}/api/schools/:schoolId/school-years`, () => {
    return HttpResponse.json(mockSchoolYears);
  }),

  http.get(
    `${API_BASE}/api/schools/:schoolId/school-years/:id`,
    ({ params }) => {
      const { id } = params;
      if (id === "year-1") {
        return HttpResponse.json(mockSchoolYearDetail);
      }
      return new HttpResponse(null, { status: 404 });
    },
  ),

  http.post(
    `${API_BASE}/api/schools/:schoolId/school-years`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockSchoolYearDetail,
          ...(body as object),
          id: "new-year-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/school-years/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockSchoolYearDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(`${API_BASE}/api/schools/:schoolId/school-years/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Terms
  http.get(
    `${API_BASE}/api/schools/:schoolId/school-years/:yearId/terms`,
    () => {
      return HttpResponse.json(mockTerms);
    },
  ),

  http.get(
    `${API_BASE}/api/schools/:schoolId/school-years/:yearId/terms/:id`,
    ({ params }) => {
      const { id } = params;
      if (id === "term-1") {
        return HttpResponse.json(mockTermDetail);
      }
      return new HttpResponse(null, { status: 404 });
    },
  ),

  http.post(
    `${API_BASE}/api/schools/:schoolId/school-years/:yearId/terms`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockTermDetail,
          ...(body as object),
          id: "new-term-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/school-years/:yearId/terms/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockTermDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(
    `${API_BASE}/api/schools/:schoolId/school-years/:yearId/terms/:id`,
    () => {
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // Time Slots
  http.get(`${API_BASE}/api/schools/:schoolId/time-slots`, () => {
    return HttpResponse.json(mockTimeSlots);
  }),

  http.get(`${API_BASE}/api/schools/:schoolId/time-slots/:id`, ({ params }) => {
    const { id } = params;
    if (id === "slot-1") {
      return HttpResponse.json(mockTimeSlotDetail);
    }
    return new HttpResponse(null, { status: 404 });
  }),

  http.post(
    `${API_BASE}/api/schools/:schoolId/time-slots`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockTimeSlotDetail,
          ...(body as object),
          id: "new-slot-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/time-slots/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockTimeSlotDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(`${API_BASE}/api/schools/:schoolId/time-slots/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Lessons
  http.get(`${API_BASE}/api/schools/:schoolId/terms/:termId/lessons`, () => {
    return HttpResponse.json(mockLessons);
  }),

  http.get(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/lessons/:id`,
    ({ params }) => {
      const { id } = params;
      if (id === "lesson-1") {
        return HttpResponse.json(mockLessonDetail);
      }
      return new HttpResponse(null, { status: 404 });
    },
  ),

  http.post(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/lessons`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockLessonDetail,
          ...(body as object),
          id: "new-lesson-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/lessons/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockLessonDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/lessons/:id`,
    () => {
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // Memberships
  http.get(`${API_BASE}/api/schools/:schoolId/members`, () => {
    return HttpResponse.json(mockMemberships);
  }),

  http.get(`${API_BASE}/api/schools/:schoolId/members/:id`, ({ params }) => {
    const { id } = params;
    if (id === "membership-1") {
      return HttpResponse.json(mockMembershipDetail);
    }
    return new HttpResponse(null, { status: 404 });
  }),

  http.post(
    `${API_BASE}/api/schools/:schoolId/members`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockMembershipDetail,
          ...(body as object),
          id: "new-membership-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/members/:id`,
    async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...mockMembershipDetail,
        ...(body as object),
        id: params.id,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(`${API_BASE}/api/schools/:schoolId/members/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Access Requests
  http.get(`${API_BASE}/api/schools/:schoolId/access-requests`, () => {
    return HttpResponse.json(mockAccessRequests);
  }),

  http.get(
    `${API_BASE}/api/schools/:schoolId/access-requests/:id`,
    ({ params }) => {
      const { id } = params;
      if (id === "request-1") {
        return HttpResponse.json(mockAccessRequestDetail);
      }
      return new HttpResponse(null, { status: 404 });
    },
  ),

  http.post(
    `${API_BASE}/api/schools/:schoolId/access-requests`,
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json(
        {
          ...mockAccessRequestDetail,
          ...(body as object),
          id: "new-request-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  http.put(
    `${API_BASE}/api/schools/:schoolId/access-requests/:id`,
    async ({ params, request }) => {
      const body = (await request.json()) as { decision: string };
      const status = body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      return HttpResponse.json({
        ...mockAccessRequestDetail,
        id: params.id,
        status,
        reviewedById: "user-1",
        reviewedByName: "Test User",
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  http.delete(`${API_BASE}/api/users/me/access-requests/:id`, () => {
    return new HttpResponse(null, { status: 204 });
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
