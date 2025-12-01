/**
 * School Class API Service
 */

import { apiClient } from "../client";
import type {
  CreateSchoolClassRequest,
  SchoolClassResponse,
  SchoolClassSummary,
  UpdateSchoolClassRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/classes`;

export const classesApi = {
  /** List all school classes for a school */
  list(schoolId: string): Promise<SchoolClassSummary[]> {
    return apiClient.get<SchoolClassSummary[]>(getBasePath(schoolId));
  },

  /** Get a school class by ID */
  get(schoolId: string, id: string): Promise<SchoolClassResponse> {
    return apiClient.get<SchoolClassResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /** Create a new school class */
  create(
    schoolId: string,
    data: CreateSchoolClassRequest,
  ): Promise<SchoolClassResponse> {
    return apiClient.post<SchoolClassResponse>(getBasePath(schoolId), data);
  },

  /** Update an existing school class */
  update(
    schoolId: string,
    id: string,
    data: UpdateSchoolClassRequest,
  ): Promise<SchoolClassResponse> {
    return apiClient.put<SchoolClassResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /** Delete a school class */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
