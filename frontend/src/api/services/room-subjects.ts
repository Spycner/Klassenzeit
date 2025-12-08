/**
 * Room Subject Suitability Service
 *
 * API operations for managing which subjects can be taught in which rooms.
 */

import { apiClient } from "../client";
import type {
  CreateRoomSubjectSuitabilityRequest,
  RoomSubjectSuitabilitySummary,
} from "../types";

const BASE_URL = (schoolId: string, roomId: string) =>
  `/api/schools/${schoolId}/rooms/${roomId}/subjects`;

export const roomSubjectsApi = {
  /**
   * List all subject suitabilities for a room
   */
  list: (schoolId: string, roomId: string) =>
    apiClient.get<RoomSubjectSuitabilitySummary[]>(BASE_URL(schoolId, roomId)),

  /**
   * Add a subject suitability to a room
   */
  create: (
    schoolId: string,
    roomId: string,
    data: CreateRoomSubjectSuitabilityRequest,
  ) =>
    apiClient.post<RoomSubjectSuitabilitySummary>(
      BASE_URL(schoolId, roomId),
      data,
    ),

  /**
   * Remove a subject suitability from a room
   */
  delete: (schoolId: string, roomId: string, id: string) =>
    apiClient.delete(`${BASE_URL(schoolId, roomId)}/${id}`),
};
