/**
 * School Class API Service
 *
 * Provides methods for managing school classes (e.g., "Grade 5A", "Year 10B")
 * within a school. Classes are groups of students that typically follow
 * a common timetable.
 */

import { apiClient } from "../client";
import type {
  CreateSchoolClassRequest,
  SchoolClassResponse,
  SchoolClassSummary,
  UpdateSchoolClassRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/classes`;

export const classesApi = {
  /**
   * Retrieves all school classes for a specific school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @returns Promise resolving to an array of class summaries
   * @throws {ClientError} When the school is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const classes = await classesApi.list("school-uuid");
   * console.log(classes.map(c => c.name));
   * ```
   */
  list(schoolId: string): Promise<SchoolClassSummary[]> {
    return apiClient.get<SchoolClassSummary[]>(getBasePath(schoolId));
  },

  /**
   * Retrieves a single school class by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the class
   * @returns Promise resolving to the full class details including version
   * @throws {ClientError} When the school or class is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const schoolClass = await classesApi.get("school-uuid", "class-uuid");
   * console.log(schoolClass.name, schoolClass.gradeLevel);
   * ```
   */
  get(schoolId: string, id: string): Promise<SchoolClassResponse> {
    return apiClient.get<SchoolClassResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /**
   * Creates a new school class within a school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param data - The class creation data containing name, grade level, and optional description
   * @returns Promise resolving to the created class with its assigned ID and version
   * @throws {ClientError} When the school is not found (404) or validation fails (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newClass = await classesApi.create("school-uuid", {
   *   name: "5A",
   *   gradeLevel: 5
   * });
   * ```
   */
  create(
    schoolId: string,
    data: CreateSchoolClassRequest,
  ): Promise<SchoolClassResponse> {
    return apiClient.post<SchoolClassResponse>(getBasePath(schoolId), data);
  },

  /**
   * Updates an existing school class.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the class to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated class with new version number
   * @throws {ClientError} When the school or class is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await classesApi.update("school-uuid", "class-uuid", {
   *   name: "5B",
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    id: string,
    data: UpdateSchoolClassRequest,
  ): Promise<SchoolClassResponse> {
    return apiClient.put<SchoolClassResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /**
   * Deletes a school class.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the class to delete
   * @returns Promise resolving when the class is successfully deleted
   * @throws {ClientError} When the school or class is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await classesApi.delete("school-uuid", "class-uuid");
   * ```
   */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
