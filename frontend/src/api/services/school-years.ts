/**
 * School Year API Service
 *
 * Provides methods for managing school years within a school. School years
 * represent academic periods (e.g., "2024-2025") that contain terms and
 * organize the school's calendar.
 */

import { apiClient } from "../client";
import type {
  CreateSchoolYearRequest,
  SchoolYearResponse,
  SchoolYearSummary,
  UpdateSchoolYearRequest,
} from "../types";

const getBasePath = (schoolId: string) =>
  `/api/schools/${schoolId}/school-years`;

export const schoolYearsApi = {
  /**
   * Retrieves all school years for a specific school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @returns Promise resolving to an array of school year summaries
   * @throws {ClientError} When the school is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const years = await schoolYearsApi.list("school-uuid");
   * console.log(years.map(y => y.name));
   * ```
   */
  list(schoolId: string): Promise<SchoolYearSummary[]> {
    return apiClient.get<SchoolYearSummary[]>(getBasePath(schoolId));
  },

  /**
   * Retrieves a single school year by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the school year
   * @returns Promise resolving to the full school year details including version
   * @throws {ClientError} When the school or school year is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const year = await schoolYearsApi.get("school-uuid", "year-uuid");
   * console.log(year.name, year.startDate, year.endDate);
   * ```
   */
  get(schoolId: string, id: string): Promise<SchoolYearResponse> {
    return apiClient.get<SchoolYearResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /**
   * Creates a new school year within a school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param data - The school year creation data containing name, start date, and end date
   * @returns Promise resolving to the created school year with its assigned ID and version
   * @throws {ClientError} When the school is not found (404) or validation fails (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newYear = await schoolYearsApi.create("school-uuid", {
   *   name: "2024-2025",
   *   startDate: "2024-09-01",
   *   endDate: "2025-06-30"
   * });
   * ```
   */
  create(
    schoolId: string,
    data: CreateSchoolYearRequest,
  ): Promise<SchoolYearResponse> {
    return apiClient.post<SchoolYearResponse>(getBasePath(schoolId), data);
  },

  /**
   * Updates an existing school year.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the school year to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated school year with new version number
   * @throws {ClientError} When the school or school year is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await schoolYearsApi.update("school-uuid", "year-uuid", {
   *   name: "2024-2025 Academic Year",
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    id: string,
    data: UpdateSchoolYearRequest,
  ): Promise<SchoolYearResponse> {
    return apiClient.put<SchoolYearResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /**
   * Deletes a school year and all its associated terms and lessons.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the school year to delete
   * @returns Promise resolving when the school year is successfully deleted
   * @throws {ClientError} When the school or school year is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await schoolYearsApi.delete("school-uuid", "year-uuid");
   * ```
   */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
