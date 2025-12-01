/**
 * Subject API Service
 */

import { apiClient } from "../client";
import type {
  CreateSubjectRequest,
  SubjectResponse,
  SubjectSummary,
  UpdateSubjectRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/subjects`;

export const subjectsApi = {
  /** List all subjects for a school */
  list(schoolId: string): Promise<SubjectSummary[]> {
    return apiClient.get<SubjectSummary[]>(getBasePath(schoolId));
  },

  /** Get a subject by ID */
  get(schoolId: string, id: string): Promise<SubjectResponse> {
    return apiClient.get<SubjectResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /** Create a new subject */
  create(
    schoolId: string,
    data: CreateSubjectRequest,
  ): Promise<SubjectResponse> {
    return apiClient.post<SubjectResponse>(getBasePath(schoolId), data);
  },

  /** Update an existing subject */
  update(
    schoolId: string,
    id: string,
    data: UpdateSubjectRequest,
  ): Promise<SubjectResponse> {
    return apiClient.put<SubjectResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /** Delete a subject */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
