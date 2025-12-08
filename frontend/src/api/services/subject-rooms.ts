/**
 * Subject Rooms Service
 *
 * API operations for managing which rooms can host lessons for a subject.
 * This is the reverse direction of room-subjects (subject→rooms vs room→subjects).
 */

import { apiClient } from "../client";
import type { AddRoomToSubjectRequest, SubjectRoomSummary } from "../types";

const BASE_URL = (schoolId: string, subjectId: string) =>
  `/api/schools/${schoolId}/subjects/${subjectId}/rooms`;

export const subjectRoomsApi = {
  /**
   * List all rooms that can host a subject
   */
  list: (schoolId: string, subjectId: string) =>
    apiClient.get<SubjectRoomSummary[]>(BASE_URL(schoolId, subjectId)),

  /**
   * Add a room to a subject
   */
  add: (schoolId: string, subjectId: string, data: AddRoomToSubjectRequest) =>
    apiClient.post<SubjectRoomSummary>(BASE_URL(schoolId, subjectId), data),

  /**
   * Remove a room from a subject
   */
  remove: (schoolId: string, subjectId: string, roomId: string) =>
    apiClient.delete(`${BASE_URL(schoolId, subjectId)}/${roomId}`),
};
