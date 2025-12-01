/**
 * Lesson API Service
 *
 * Provides methods for managing lessons (timetable entries) within a term.
 * Lessons connect teachers, classes, subjects, rooms, and time slots to
 * create scheduled teaching sessions.
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
  /**
   * Retrieves all lessons for a specific term.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param termId - The unique identifier (UUID) of the term
   * @returns Promise resolving to an array of lesson summaries
   * @throws {ClientError} When the school or term is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const lessons = await lessonsApi.list("school-uuid", "term-uuid");
   * console.log(lessons.map(l => `${l.subjectName} - ${l.teacherName}`));
   * ```
   */
  list(schoolId: string, termId: string): Promise<LessonSummary[]> {
    return apiClient.get<LessonSummary[]>(getBasePath(schoolId, termId));
  },

  /**
   * Retrieves a single lesson by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param termId - The unique identifier (UUID) of the term
   * @param id - The unique identifier (UUID) of the lesson
   * @returns Promise resolving to the full lesson details including version
   * @throws {ClientError} When the school, term, or lesson is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const lesson = await lessonsApi.get("school-uuid", "term-uuid", "lesson-uuid");
   * console.log(lesson.subjectId, lesson.teacherId, lesson.roomId);
   * ```
   */
  get(schoolId: string, termId: string, id: string): Promise<LessonResponse> {
    return apiClient.get<LessonResponse>(
      `${getBasePath(schoolId, termId)}/${id}`,
    );
  },

  /**
   * Creates a new lesson within a term.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param termId - The unique identifier (UUID) of the term
   * @param data - The lesson creation data containing subject, teacher, class, room, and time slot references
   * @returns Promise resolving to the created lesson with its assigned ID and version
   * @throws {ClientError} When the school or term is not found (404), validation fails (400), or referenced entities don't exist
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newLesson = await lessonsApi.create("school-uuid", "term-uuid", {
   *   subjectId: "subject-uuid",
   *   teacherId: "teacher-uuid",
   *   schoolClassId: "class-uuid",
   *   roomId: "room-uuid",
   *   timeSlotId: "timeslot-uuid"
   * });
   * ```
   */
  create(
    schoolId: string,
    termId: string,
    data: CreateLessonRequest,
  ): Promise<LessonResponse> {
    return apiClient.post<LessonResponse>(getBasePath(schoolId, termId), data);
  },

  /**
   * Updates an existing lesson.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param termId - The unique identifier (UUID) of the term
   * @param id - The unique identifier (UUID) of the lesson to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated lesson with new version number
   * @throws {ClientError} When the school, term, or lesson is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await lessonsApi.update("school-uuid", "term-uuid", "lesson-uuid", {
   *   roomId: "new-room-uuid",
   *   version: 1
   * });
   * ```
   */
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

  /**
   * Deletes a lesson.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param termId - The unique identifier (UUID) of the term
   * @param id - The unique identifier (UUID) of the lesson to delete
   * @returns Promise resolving when the lesson is successfully deleted
   * @throws {ClientError} When the school, term, or lesson is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await lessonsApi.delete("school-uuid", "term-uuid", "lesson-uuid");
   * ```
   */
  delete(schoolId: string, termId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId, termId)}/${id}`);
  },
};
