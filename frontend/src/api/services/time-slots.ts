/**
 * Time Slot API Service
 *
 * Provides methods for managing time slots within a school. Time slots define
 * the periods during which lessons can be scheduled (e.g., "Period 1: 08:00-08:45").
 */

import { apiClient } from "../client";
import type {
  CreateTimeSlotRequest,
  TimeSlotResponse,
  TimeSlotSummary,
  UpdateTimeSlotRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/time-slots`;

export const timeSlotsApi = {
  /**
   * Retrieves all time slots for a specific school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @returns Promise resolving to an array of time slot summaries
   * @throws {ClientError} When the school is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const slots = await timeSlotsApi.list("school-uuid");
   * console.log(slots.map(s => `${s.name}: ${s.startTime}-${s.endTime}`));
   * ```
   */
  list(schoolId: string): Promise<TimeSlotSummary[]> {
    return apiClient.get<TimeSlotSummary[]>(getBasePath(schoolId));
  },

  /**
   * Retrieves a single time slot by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the time slot
   * @returns Promise resolving to the full time slot details including version
   * @throws {ClientError} When the school or time slot is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const slot = await timeSlotsApi.get("school-uuid", "slot-uuid");
   * console.log(slot.name, slot.startTime, slot.endTime);
   * ```
   */
  get(schoolId: string, id: string): Promise<TimeSlotResponse> {
    return apiClient.get<TimeSlotResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /**
   * Creates a new time slot within a school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param data - The time slot creation data containing name, day of week, start time, and end time
   * @returns Promise resolving to the created time slot with its assigned ID and version
   * @throws {ClientError} When the school is not found (404) or validation fails (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newSlot = await timeSlotsApi.create("school-uuid", {
   *   name: "Period 1",
   *   dayOfWeek: 1, // Monday
   *   startTime: "08:00",
   *   endTime: "08:45"
   * });
   * ```
   */
  create(
    schoolId: string,
    data: CreateTimeSlotRequest,
  ): Promise<TimeSlotResponse> {
    return apiClient.post<TimeSlotResponse>(getBasePath(schoolId), data);
  },

  /**
   * Updates an existing time slot.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the time slot to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated time slot with new version number
   * @throws {ClientError} When the school or time slot is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await timeSlotsApi.update("school-uuid", "slot-uuid", {
   *   endTime: "09:00",
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    id: string,
    data: UpdateTimeSlotRequest,
  ): Promise<TimeSlotResponse> {
    return apiClient.put<TimeSlotResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /**
   * Deletes a time slot.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the time slot to delete
   * @returns Promise resolving when the time slot is successfully deleted
   * @throws {ClientError} When the school or time slot is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await timeSlotsApi.delete("school-uuid", "slot-uuid");
   * ```
   */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
