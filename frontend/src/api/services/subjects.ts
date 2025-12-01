/**
 * Subject API Service
 *
 * Provides methods for managing subjects within a school. Subjects represent
 * courses or disciplines that can be taught (e.g., Mathematics, English, Physics).
 */

import { apiClient } from "../client";
import type {
  CreateSubjectRequest,
  SubjectResponse,
  SubjectSummary,
  UpdateSubjectRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/subjects`;

export const subjectsApi = {
  /**
   * Retrieves all subjects for a specific school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @returns Promise resolving to an array of subject summaries
   * @throws {ClientError} When the school is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const subjects = await subjectsApi.list("school-uuid");
   * console.log(subjects.map(s => s.name));
   * ```
   */
  list(schoolId: string): Promise<SubjectSummary[]> {
    return apiClient.get<SubjectSummary[]>(getBasePath(schoolId));
  },

  /**
   * Retrieves a single subject by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the subject
   * @returns Promise resolving to the full subject details including version
   * @throws {ClientError} When the school or subject is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const subject = await subjectsApi.get("school-uuid", "subject-uuid");
   * console.log(subject.name, subject.abbreviation);
   * ```
   */
  get(schoolId: string, id: string): Promise<SubjectResponse> {
    return apiClient.get<SubjectResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /**
   * Creates a new subject within a school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param data - The subject creation data containing name, abbreviation, and optional description
   * @returns Promise resolving to the created subject with its assigned ID and version
   * @throws {ClientError} When the school is not found (404) or validation fails (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newSubject = await subjectsApi.create("school-uuid", {
   *   name: "Mathematics",
   *   abbreviation: "MATH"
   * });
   * ```
   */
  create(
    schoolId: string,
    data: CreateSubjectRequest,
  ): Promise<SubjectResponse> {
    return apiClient.post<SubjectResponse>(getBasePath(schoolId), data);
  },

  /**
   * Updates an existing subject.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the subject to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated subject with new version number
   * @throws {ClientError} When the school or subject is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await subjectsApi.update("school-uuid", "subject-uuid", {
   *   name: "Advanced Mathematics",
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    id: string,
    data: UpdateSubjectRequest,
  ): Promise<SubjectResponse> {
    return apiClient.put<SubjectResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /**
   * Deletes a subject.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the subject to delete
   * @returns Promise resolving when the subject is successfully deleted
   * @throws {ClientError} When the school or subject is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await subjectsApi.delete("school-uuid", "subject-uuid");
   * ```
   */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
