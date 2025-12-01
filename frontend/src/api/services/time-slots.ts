/**
 * Time Slot API Service
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
  /** List all time slots for a school */
  list(schoolId: string): Promise<TimeSlotSummary[]> {
    return apiClient.get<TimeSlotSummary[]>(getBasePath(schoolId));
  },

  /** Get a time slot by ID */
  get(schoolId: string, id: string): Promise<TimeSlotResponse> {
    return apiClient.get<TimeSlotResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /** Create a new time slot */
  create(
    schoolId: string,
    data: CreateTimeSlotRequest,
  ): Promise<TimeSlotResponse> {
    return apiClient.post<TimeSlotResponse>(getBasePath(schoolId), data);
  },

  /** Update an existing time slot */
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

  /** Delete a time slot */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
