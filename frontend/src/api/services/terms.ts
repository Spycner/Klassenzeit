/**
 * Term API Service
 *
 * Provides methods for managing terms within a school year. Terms are
 * subdivisions of a school year (e.g., "Fall Semester", "Spring Term")
 * that contain scheduled lessons.
 */

import { apiClient } from "../client";
import type {
  CreateTermRequest,
  TermResponse,
  TermSummary,
  UpdateTermRequest,
} from "../types";

const getBasePath = (schoolId: string, schoolYearId: string) =>
  `/api/schools/${schoolId}/school-years/${schoolYearId}/terms`;

export const termsApi = {
  /**
   * Retrieves all terms for a specific school year.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param schoolYearId - The unique identifier (UUID) of the school year
   * @returns Promise resolving to an array of term summaries
   * @throws {ClientError} When the school or school year is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const terms = await termsApi.list("school-uuid", "year-uuid");
   * console.log(terms.map(t => `${t.name}: ${t.startDate} - ${t.endDate}`));
   * ```
   */
  list(schoolId: string, schoolYearId: string): Promise<TermSummary[]> {
    return apiClient.get<TermSummary[]>(getBasePath(schoolId, schoolYearId));
  },

  /**
   * Retrieves a single term by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param schoolYearId - The unique identifier (UUID) of the school year
   * @param id - The unique identifier (UUID) of the term
   * @returns Promise resolving to the full term details including version
   * @throws {ClientError} When the school, school year, or term is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const term = await termsApi.get("school-uuid", "year-uuid", "term-uuid");
   * console.log(term.name, term.startDate, term.endDate);
   * ```
   */
  get(
    schoolId: string,
    schoolYearId: string,
    id: string,
  ): Promise<TermResponse> {
    return apiClient.get<TermResponse>(
      `${getBasePath(schoolId, schoolYearId)}/${id}`,
    );
  },

  /**
   * Creates a new term within a school year.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param schoolYearId - The unique identifier (UUID) of the school year
   * @param data - The term creation data containing name, start date, and end date
   * @returns Promise resolving to the created term with its assigned ID and version
   * @throws {ClientError} When the school or school year is not found (404) or validation fails (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newTerm = await termsApi.create("school-uuid", "year-uuid", {
   *   name: "Fall Semester",
   *   startDate: "2024-09-01",
   *   endDate: "2024-12-20"
   * });
   * ```
   */
  create(
    schoolId: string,
    schoolYearId: string,
    data: CreateTermRequest,
  ): Promise<TermResponse> {
    return apiClient.post<TermResponse>(
      getBasePath(schoolId, schoolYearId),
      data,
    );
  },

  /**
   * Updates an existing term.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param schoolYearId - The unique identifier (UUID) of the school year
   * @param id - The unique identifier (UUID) of the term to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated term with new version number
   * @throws {ClientError} When the school, school year, or term is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await termsApi.update("school-uuid", "year-uuid", "term-uuid", {
   *   name: "Fall Semester 2024",
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    schoolYearId: string,
    id: string,
    data: UpdateTermRequest,
  ): Promise<TermResponse> {
    return apiClient.put<TermResponse>(
      `${getBasePath(schoolId, schoolYearId)}/${id}`,
      data,
    );
  },

  /**
   * Deletes a term and all its associated lessons.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param schoolYearId - The unique identifier (UUID) of the school year
   * @param id - The unique identifier (UUID) of the term to delete
   * @returns Promise resolving when the term is successfully deleted
   * @throws {ClientError} When the school, school year, or term is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await termsApi.delete("school-uuid", "year-uuid", "term-uuid");
   * ```
   */
  delete(schoolId: string, schoolYearId: string, id: string): Promise<void> {
    return apiClient.delete<void>(
      `${getBasePath(schoolId, schoolYearId)}/${id}`,
    );
  },
};
