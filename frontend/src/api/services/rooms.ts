/**
 * Room API Service
 */

import { apiClient } from "../client";
import type {
  CreateRoomRequest,
  RoomResponse,
  RoomSummary,
  UpdateRoomRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/rooms`;

export const roomsApi = {
  /** List all rooms for a school */
  list(schoolId: string): Promise<RoomSummary[]> {
    return apiClient.get<RoomSummary[]>(getBasePath(schoolId));
  },

  /** Get a room by ID */
  get(schoolId: string, id: string): Promise<RoomResponse> {
    return apiClient.get<RoomResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /** Create a new room */
  create(schoolId: string, data: CreateRoomRequest): Promise<RoomResponse> {
    return apiClient.post<RoomResponse>(getBasePath(schoolId), data);
  },

  /** Update an existing room */
  update(
    schoolId: string,
    id: string,
    data: UpdateRoomRequest,
  ): Promise<RoomResponse> {
    return apiClient.put<RoomResponse>(`${getBasePath(schoolId)}/${id}`, data);
  },

  /** Delete a room */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
