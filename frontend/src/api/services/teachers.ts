/**
 * Teacher API Service
 *
 * Provides methods for managing teachers, their qualifications, and availability
 * within a school. Teachers can be assigned to lessons based on their
 * qualifications and availability constraints.
 */

import { apiClient } from "../client";
import type {
  AvailabilityResponse,
  AvailabilitySummary,
  CreateAvailabilityRequest,
  CreateQualificationRequest,
  CreateTeacherRequest,
  QualificationResponse,
  QualificationSummary,
  TeacherResponse,
  TeacherSummary,
  UpdateAvailabilityRequest,
  UpdateQualificationRequest,
  UpdateTeacherRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/teachers`;

// ============================================================================
// Teacher CRUD
// ============================================================================

export const teachersApi = {
  /**
   * Retrieves all teachers for a specific school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @returns Promise resolving to an array of teacher summaries
   * @throws {ClientError} When the school is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const teachers = await teachersApi.list("school-uuid");
   * console.log(teachers.map(t => `${t.firstName} ${t.lastName}`));
   * ```
   */
  list(schoolId: string): Promise<TeacherSummary[]> {
    return apiClient.get<TeacherSummary[]>(getBasePath(schoolId));
  },

  /**
   * Retrieves a single teacher by their unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the teacher
   * @returns Promise resolving to the full teacher details including version
   * @throws {ClientError} When the school or teacher is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const teacher = await teachersApi.get("school-uuid", "teacher-uuid");
   * console.log(teacher.firstName, teacher.lastName, teacher.email);
   * ```
   */
  get(schoolId: string, id: string): Promise<TeacherResponse> {
    return apiClient.get<TeacherResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /**
   * Creates a new teacher within a school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param data - The teacher creation data containing name, email, and other details
   * @returns Promise resolving to the created teacher with their assigned ID and version
   * @throws {ClientError} When the school is not found (404) or validation fails (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newTeacher = await teachersApi.create("school-uuid", {
   *   firstName: "John",
   *   lastName: "Smith",
   *   email: "john.smith@school.edu"
   * });
   * ```
   */
  create(
    schoolId: string,
    data: CreateTeacherRequest,
  ): Promise<TeacherResponse> {
    return apiClient.post<TeacherResponse>(getBasePath(schoolId), data);
  },

  /**
   * Updates an existing teacher.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the teacher to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated teacher with new version number
   * @throws {ClientError} When the school or teacher is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await teachersApi.update("school-uuid", "teacher-uuid", {
   *   email: "j.smith@school.edu",
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    id: string,
    data: UpdateTeacherRequest,
  ): Promise<TeacherResponse> {
    return apiClient.put<TeacherResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /**
   * Deletes a teacher and all their qualifications and availability entries.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the teacher to delete
   * @returns Promise resolving when the teacher is successfully deleted
   * @throws {ClientError} When the school or teacher is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await teachersApi.delete("school-uuid", "teacher-uuid");
   * ```
   */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};

// ============================================================================
// Teacher Qualifications
// ============================================================================

const getQualificationsPath = (schoolId: string, teacherId: string) =>
  `/api/schools/${schoolId}/teachers/${teacherId}/qualifications`;

/**
 * Qualifications API
 *
 * Manages teacher qualifications that specify which subjects a teacher
 * is certified to teach. Used by the scheduling algorithm to ensure
 * teachers are only assigned to subjects they're qualified for.
 */
export const qualificationsApi = {
  /**
   * Retrieves all qualifications for a specific teacher.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @returns Promise resolving to an array of qualification summaries
   * @throws {ClientError} When the school or teacher is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const qualifications = await qualificationsApi.list("school-uuid", "teacher-uuid");
   * console.log(qualifications.map(q => q.subjectName));
   * ```
   */
  list(schoolId: string, teacherId: string): Promise<QualificationSummary[]> {
    return apiClient.get<QualificationSummary[]>(
      getQualificationsPath(schoolId, teacherId),
    );
  },

  /**
   * Retrieves a single qualification by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @param id - The unique identifier (UUID) of the qualification
   * @returns Promise resolving to the full qualification details including version
   * @throws {ClientError} When the school, teacher, or qualification is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const qualification = await qualificationsApi.get("school-uuid", "teacher-uuid", "qual-uuid");
   * console.log(qualification.subjectId, qualification.level);
   * ```
   */
  get(
    schoolId: string,
    teacherId: string,
    id: string,
  ): Promise<QualificationResponse> {
    return apiClient.get<QualificationResponse>(
      `${getQualificationsPath(schoolId, teacherId)}/${id}`,
    );
  },

  /**
   * Creates a new qualification for a teacher.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @param data - The qualification creation data containing subject reference and level
   * @returns Promise resolving to the created qualification with its assigned ID and version
   * @throws {ClientError} When the school or teacher is not found (404), validation fails (400), or subject doesn't exist
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newQual = await qualificationsApi.create("school-uuid", "teacher-uuid", {
   *   subjectId: "subject-uuid"
   * });
   * ```
   */
  create(
    schoolId: string,
    teacherId: string,
    data: CreateQualificationRequest,
  ): Promise<QualificationResponse> {
    return apiClient.post<QualificationResponse>(
      getQualificationsPath(schoolId, teacherId),
      data,
    );
  },

  /**
   * Updates an existing qualification.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @param id - The unique identifier (UUID) of the qualification to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated qualification with new version number
   * @throws {ClientError} When the school, teacher, or qualification is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await qualificationsApi.update("school-uuid", "teacher-uuid", "qual-uuid", {
   *   subjectId: "new-subject-uuid",
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    teacherId: string,
    id: string,
    data: UpdateQualificationRequest,
  ): Promise<QualificationResponse> {
    return apiClient.put<QualificationResponse>(
      `${getQualificationsPath(schoolId, teacherId)}/${id}`,
      data,
    );
  },

  /**
   * Deletes a qualification.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @param id - The unique identifier (UUID) of the qualification to delete
   * @returns Promise resolving when the qualification is successfully deleted
   * @throws {ClientError} When the school, teacher, or qualification is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await qualificationsApi.delete("school-uuid", "teacher-uuid", "qual-uuid");
   * ```
   */
  delete(schoolId: string, teacherId: string, id: string): Promise<void> {
    return apiClient.delete<void>(
      `${getQualificationsPath(schoolId, teacherId)}/${id}`,
    );
  },
};

// ============================================================================
// Teacher Availability
// ============================================================================

const getAvailabilityPath = (schoolId: string, teacherId: string) =>
  `/api/schools/${schoolId}/teachers/${teacherId}/availability`;

/**
 * Availability API
 *
 * Manages teacher availability constraints that specify when a teacher
 * can or cannot be scheduled for lessons. Used by the scheduling algorithm
 * to respect teacher preferences and constraints.
 */
export const availabilityApi = {
  /**
   * Retrieves all availability entries for a specific teacher.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @returns Promise resolving to an array of availability summaries
   * @throws {ClientError} When the school or teacher is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const availability = await availabilityApi.list("school-uuid", "teacher-uuid");
   * console.log(availability.map(a => `${a.dayOfWeek}: ${a.startTime}-${a.endTime}`));
   * ```
   */
  list(schoolId: string, teacherId: string): Promise<AvailabilitySummary[]> {
    return apiClient.get<AvailabilitySummary[]>(
      getAvailabilityPath(schoolId, teacherId),
    );
  },

  /**
   * Retrieves a single availability entry by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @param id - The unique identifier (UUID) of the availability entry
   * @returns Promise resolving to the full availability details including version
   * @throws {ClientError} When the school, teacher, or availability entry is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const entry = await availabilityApi.get("school-uuid", "teacher-uuid", "avail-uuid");
   * console.log(entry.dayOfWeek, entry.startTime, entry.endTime);
   * ```
   */
  get(
    schoolId: string,
    teacherId: string,
    id: string,
  ): Promise<AvailabilityResponse> {
    return apiClient.get<AvailabilityResponse>(
      `${getAvailabilityPath(schoolId, teacherId)}/${id}`,
    );
  },

  /**
   * Creates a new availability entry for a teacher.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @param data - The availability creation data containing day, time range, and availability type
   * @returns Promise resolving to the created availability entry with its assigned ID and version
   * @throws {ClientError} When the school or teacher is not found (404) or validation fails (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newEntry = await availabilityApi.create("school-uuid", "teacher-uuid", {
   *   dayOfWeek: 1, // Monday
   *   startTime: "08:00",
   *   endTime: "12:00",
   *   available: true
   * });
   * ```
   */
  create(
    schoolId: string,
    teacherId: string,
    data: CreateAvailabilityRequest,
  ): Promise<AvailabilityResponse> {
    return apiClient.post<AvailabilityResponse>(
      getAvailabilityPath(schoolId, teacherId),
      data,
    );
  },

  /**
   * Updates an existing availability entry.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @param id - The unique identifier (UUID) of the availability entry to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated availability entry with new version number
   * @throws {ClientError} When the school, teacher, or availability entry is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await availabilityApi.update("school-uuid", "teacher-uuid", "avail-uuid", {
   *   endTime: "13:00",
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    teacherId: string,
    id: string,
    data: UpdateAvailabilityRequest,
  ): Promise<AvailabilityResponse> {
    return apiClient.put<AvailabilityResponse>(
      `${getAvailabilityPath(schoolId, teacherId)}/${id}`,
      data,
    );
  },

  /**
   * Deletes an availability entry.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param teacherId - The unique identifier (UUID) of the teacher
   * @param id - The unique identifier (UUID) of the availability entry to delete
   * @returns Promise resolving when the availability entry is successfully deleted
   * @throws {ClientError} When the school, teacher, or availability entry is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await availabilityApi.delete("school-uuid", "teacher-uuid", "avail-uuid");
   * ```
   */
  delete(schoolId: string, teacherId: string, id: string): Promise<void> {
    return apiClient.delete<void>(
      `${getAvailabilityPath(schoolId, teacherId)}/${id}`,
    );
  },
};
