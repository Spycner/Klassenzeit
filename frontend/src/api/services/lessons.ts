/**
 * Lesson API Service (Timetable entries)
 */

import { apiClient } from "../client";
import type {
  CreateLessonRequest,
  LessonResponse,
  LessonSummary,
  UpdateLessonRequest,
} from "../types";

const getBasePath = (schoolId: string, termId: string) =>
  `/api/schools/${schoolId}/terms/${termId}/lessons`;

export const lessonsApi = {
  /** List all lessons for a term */
  list(schoolId: string, termId: string): Promise<LessonSummary[]> {
    return apiClient.get<LessonSummary[]>(getBasePath(schoolId, termId));
  },

  /** Get a lesson by ID */
  get(schoolId: string, termId: string, id: string): Promise<LessonResponse> {
    return apiClient.get<LessonResponse>(
      `${getBasePath(schoolId, termId)}/${id}`,
    );
  },

  /** Create a new lesson */
  create(
    schoolId: string,
    termId: string,
    data: CreateLessonRequest,
  ): Promise<LessonResponse> {
    return apiClient.post<LessonResponse>(getBasePath(schoolId, termId), data);
  },

  /** Update an existing lesson */
  update(
    schoolId: string,
    termId: string,
    id: string,
    data: UpdateLessonRequest,
  ): Promise<LessonResponse> {
    return apiClient.put<LessonResponse>(
      `${getBasePath(schoolId, termId)}/${id}`,
      data,
    );
  },

  /** Delete a lesson */
  delete(schoolId: string, termId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId, termId)}/${id}`);
  },
};
