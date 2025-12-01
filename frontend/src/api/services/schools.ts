/**
 * School API Service
 */

import { apiClient } from "../client";
import type {
  CreateSchoolRequest,
  SchoolResponse,
  SchoolSummary,
  UpdateSchoolRequest,
} from "../types";

const BASE_PATH = "/api/schools";

export const schoolsApi = {
  /** List all schools */
  list(): Promise<SchoolSummary[]> {
    return apiClient.get<SchoolSummary[]>(BASE_PATH);
  },

  /** Get a school by ID */
  get(id: string): Promise<SchoolResponse> {
    return apiClient.get<SchoolResponse>(`${BASE_PATH}/${id}`);
  },

  /** Create a new school */
  create(data: CreateSchoolRequest): Promise<SchoolResponse> {
    return apiClient.post<SchoolResponse>(BASE_PATH, data);
  },

  /** Update an existing school */
  update(id: string, data: UpdateSchoolRequest): Promise<SchoolResponse> {
    return apiClient.put<SchoolResponse>(`${BASE_PATH}/${id}`, data);
  },

  /** Delete a school */
  delete(id: string): Promise<void> {
    return apiClient.delete<void>(`${BASE_PATH}/${id}`);
  },
};
