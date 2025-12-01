/**
 * Term API Service
 */

import { apiClient } from "../client";
import type {
  CreateTermRequest,
  TermResponse,
  TermSummary,
  UpdateTermRequest,
} from "../types";

const getBasePath = (schoolId: string, schoolYearId: string) =>
  `/api/schools/${schoolId}/school-years/${schoolYearId}/terms`;

export const termsApi = {
  /** List all terms for a school year */
  list(schoolId: string, schoolYearId: string): Promise<TermSummary[]> {
    return apiClient.get<TermSummary[]>(getBasePath(schoolId, schoolYearId));
  },

  /** Get a term by ID */
  get(
    schoolId: string,
    schoolYearId: string,
    id: string,
  ): Promise<TermResponse> {
    return apiClient.get<TermResponse>(
      `${getBasePath(schoolId, schoolYearId)}/${id}`,
    );
  },

  /** Create a new term */
  create(
    schoolId: string,
    schoolYearId: string,
    data: CreateTermRequest,
  ): Promise<TermResponse> {
    return apiClient.post<TermResponse>(
      getBasePath(schoolId, schoolYearId),
      data,
    );
  },

  /** Update an existing term */
  update(
    schoolId: string,
    schoolYearId: string,
    id: string,
    data: UpdateTermRequest,
  ): Promise<TermResponse> {
    return apiClient.put<TermResponse>(
      `${getBasePath(schoolId, schoolYearId)}/${id}`,
      data,
    );
  },

  /** Delete a term */
  delete(schoolId: string, schoolYearId: string, id: string): Promise<void> {
    return apiClient.delete<void>(
      `${getBasePath(schoolId, schoolYearId)}/${id}`,
    );
  },
};
