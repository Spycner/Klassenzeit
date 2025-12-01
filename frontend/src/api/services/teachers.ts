/**
 * Teacher API Service (including Qualifications and Availability)
 */

import { apiClient } from "../client";
import type {
  AvailabilityResponse,
  AvailabilitySummary,
  CreateAvailabilityRequest,
  CreateQualificationRequest,
  CreateTeacherRequest,
  QualificationResponse,
  QualificationSummary,
  TeacherResponse,
  TeacherSummary,
  UpdateAvailabilityRequest,
  UpdateQualificationRequest,
  UpdateTeacherRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/teachers`;

// ============================================================================
// Teacher CRUD
// ============================================================================

export const teachersApi = {
  /** List all teachers for a school */
  list(schoolId: string): Promise<TeacherSummary[]> {
    return apiClient.get<TeacherSummary[]>(getBasePath(schoolId));
  },

  /** Get a teacher by ID */
  get(schoolId: string, id: string): Promise<TeacherResponse> {
    return apiClient.get<TeacherResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /** Create a new teacher */
  create(
    schoolId: string,
    data: CreateTeacherRequest,
  ): Promise<TeacherResponse> {
    return apiClient.post<TeacherResponse>(getBasePath(schoolId), data);
  },

  /** Update an existing teacher */
  update(
    schoolId: string,
    id: string,
    data: UpdateTeacherRequest,
  ): Promise<TeacherResponse> {
    return apiClient.put<TeacherResponse>(
      `${getBasePath(schoolId)}/${id}`,
      data,
    );
  },

  /** Delete a teacher */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};

// ============================================================================
// Teacher Qualifications
// ============================================================================

const getQualificationsPath = (schoolId: string, teacherId: string) =>
  `/api/schools/${schoolId}/teachers/${teacherId}/qualifications`;

export const qualificationsApi = {
  /** List all qualifications for a teacher */
  list(schoolId: string, teacherId: string): Promise<QualificationSummary[]> {
    return apiClient.get<QualificationSummary[]>(
      getQualificationsPath(schoolId, teacherId),
    );
  },

  /** Get a qualification by ID */
  get(
    schoolId: string,
    teacherId: string,
    id: string,
  ): Promise<QualificationResponse> {
    return apiClient.get<QualificationResponse>(
      `${getQualificationsPath(schoolId, teacherId)}/${id}`,
    );
  },

  /** Create a new qualification */
  create(
    schoolId: string,
    teacherId: string,
    data: CreateQualificationRequest,
  ): Promise<QualificationResponse> {
    return apiClient.post<QualificationResponse>(
      getQualificationsPath(schoolId, teacherId),
      data,
    );
  },

  /** Update an existing qualification */
  update(
    schoolId: string,
    teacherId: string,
    id: string,
    data: UpdateQualificationRequest,
  ): Promise<QualificationResponse> {
    return apiClient.put<QualificationResponse>(
      `${getQualificationsPath(schoolId, teacherId)}/${id}`,
      data,
    );
  },

  /** Delete a qualification */
  delete(schoolId: string, teacherId: string, id: string): Promise<void> {
    return apiClient.delete<void>(
      `${getQualificationsPath(schoolId, teacherId)}/${id}`,
    );
  },
};

// ============================================================================
// Teacher Availability
// ============================================================================

const getAvailabilityPath = (schoolId: string, teacherId: string) =>
  `/api/schools/${schoolId}/teachers/${teacherId}/availability`;

export const availabilityApi = {
  /** List all availability entries for a teacher */
  list(schoolId: string, teacherId: string): Promise<AvailabilitySummary[]> {
    return apiClient.get<AvailabilitySummary[]>(
      getAvailabilityPath(schoolId, teacherId),
    );
  },

  /** Get an availability entry by ID */
  get(
    schoolId: string,
    teacherId: string,
    id: string,
  ): Promise<AvailabilityResponse> {
    return apiClient.get<AvailabilityResponse>(
      `${getAvailabilityPath(schoolId, teacherId)}/${id}`,
    );
  },

  /** Create a new availability entry */
  create(
    schoolId: string,
    teacherId: string,
    data: CreateAvailabilityRequest,
  ): Promise<AvailabilityResponse> {
    return apiClient.post<AvailabilityResponse>(
      getAvailabilityPath(schoolId, teacherId),
      data,
    );
  },

  /** Update an existing availability entry */
  update(
    schoolId: string,
    teacherId: string,
    id: string,
    data: UpdateAvailabilityRequest,
  ): Promise<AvailabilityResponse> {
    return apiClient.put<AvailabilityResponse>(
      `${getAvailabilityPath(schoolId, teacherId)}/${id}`,
      data,
    );
  },

  /** Delete an availability entry */
  delete(schoolId: string, teacherId: string, id: string): Promise<void> {
    return apiClient.delete<void>(
      `${getAvailabilityPath(schoolId, teacherId)}/${id}`,
    );
  },
};
