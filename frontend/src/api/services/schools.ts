/**
 * School API Service
 *
 * Provides methods for managing schools in the Klassenzeit system.
 * Schools are the top-level organizational unit containing teachers,
 * classes, rooms, and schedules.
 */

import { apiClient } from "../client";
import type {
  CreateSchoolRequest,
  SchoolResponse,
  SchoolSummary,
  UpdateSchoolRequest,
} from "../types";

const BASE_PATH = "/api/schools";

export const schoolsApi = {
  /**
   * Retrieves a list of all schools.
   *
   * @returns Promise resolving to an array of school summaries
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const schools = await schoolsApi.list();
   * console.log(schools.map(s => s.name));
   * ```
   */
  list(): Promise<SchoolSummary[]> {
    return apiClient.get<SchoolSummary[]>(BASE_PATH);
  },

  /**
   * Retrieves a single school by its unique identifier.
   *
   * @param id - The unique identifier (UUID) of the school
   * @returns Promise resolving to the full school details including version
   * @throws {ClientError} When the school is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const school = await schoolsApi.get("123e4567-e89b-12d3-a456-426614174000");
   * console.log(school.name, school.version);
   * ```
   */
  get(id: string): Promise<SchoolResponse> {
    return apiClient.get<SchoolResponse>(`${BASE_PATH}/${id}`);
  },

  /**
   * Creates a new school.
   *
   * @param data - The school creation data containing name and optional description
   * @returns Promise resolving to the created school with its assigned ID and version
   * @throws {ClientError} When validation fails (400) or request is invalid
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newSchool = await schoolsApi.create({
   *   name: "Example School",
   *   description: "A sample school"
   * });
   * console.log(newSchool.id);
   * ```
   */
  create(data: CreateSchoolRequest): Promise<SchoolResponse> {
    return apiClient.post<SchoolResponse>(BASE_PATH, data);
  },

  /**
   * Updates an existing school.
   *
   * @param id - The unique identifier (UUID) of the school to update
   * @param data - The update data containing name, description, and version for optimistic locking
   * @returns Promise resolving to the updated school with new version number
   * @throws {ClientError} When the school is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await schoolsApi.update("123e4567-e89b-12d3-a456-426614174000", {
   *   name: "Updated School Name",
   *   version: 1
   * });
   * ```
   */
  update(id: string, data: UpdateSchoolRequest): Promise<SchoolResponse> {
    return apiClient.put<SchoolResponse>(`${BASE_PATH}/${id}`, data);
  },

  /**
   * Deletes a school and all its associated data.
   *
   * This is a cascading delete that removes all teachers, classes, rooms,
   * subjects, time slots, school years, and lessons associated with the school.
   *
   * @param id - The unique identifier (UUID) of the school to delete
   * @returns Promise resolving when the school is successfully deleted
   * @throws {ClientError} When the school is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await schoolsApi.delete("123e4567-e89b-12d3-a456-426614174000");
   * ```
   */
  delete(id: string): Promise<void> {
    return apiClient.delete<void>(`${BASE_PATH}/${id}`);
  },
};
