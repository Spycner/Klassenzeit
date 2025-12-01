/**
 * School Year API Service
 */

import { apiClient } from "../client";
import type {
  CreateSchoolYearRequest,
  SchoolYearResponse,
  SchoolYearSummary,
  UpdateSchoolYearRequest,
} from "../types";

const getBasePath = (schoolId: string) =>
  `/api/schools/${schoolId}/school-years`;

export const schoolYearsApi = {
  /** List all school years for a school */
  list(schoolId: string): Promise<SchoolYearSummary[]> {
    return apiClient.get<SchoolYearSummary[]>(getBasePath(schoolId));
  },

  /** Get a school year by ID */
  get(schoolId: string, id: string): Promise<SchoolYearResponse> {
    return apiClient.get<SchoolYearResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /** Create a new school year */
  create(
    schoolId: string,
    data: CreateSchoolYearRequest,
  ): Promise<SchoolYearResponse> {
    return apiClient.post<SchoolYearResponse>(getBasePath(schoolId), data);
  },

  /** Update an existing school year */
  update(
    schoolId: string,
    id: string,
    data: UpdateSchoolYearRequest,
  ): Promise<SchoolYearResponse> {
    return apiClient.put<SchoolYearResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /** Delete a school year */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
