import type { SchoolRole } from "@/auth/types";

import { apiClient } from "../client";

/**
 * Request payload for creating an access request.
 */
export interface CreateAccessRequestRequest {
  requestedRole: SchoolRole;
  message?: string;
}

/**
 * Request payload for reviewing an access request.
 */
export interface ReviewAccessRequestRequest {
  decision: "APPROVE" | "REJECT";
  responseMessage?: string;
}

/**
 * Access request status.
 */
export type AccessRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

/**
 * Full access request response.
 */
export interface AccessRequestResponse {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  schoolId: string;
  schoolName: string;
  requestedRole: SchoolRole;
  status: AccessRequestStatus;
  message: string | null;
  responseMessage: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Summary of an access request for list views.
 */
export interface AccessRequestSummary {
  id: string;
  userDisplayName: string;
  userEmail: string;
  requestedRole: SchoolRole;
  status: AccessRequestStatus;
  createdAt: string;
}

/**
 * Access requests API service.
 */
export const accessRequestsApi = {
  /**
   * Create an access request for a school (any authenticated user).
   */
  create(
    schoolId: string,
    data: CreateAccessRequestRequest,
  ): Promise<AccessRequestResponse> {
    return apiClient.post(`/api/schools/${schoolId}/access-requests`, data);
  },

  /**
   * Cancel own pending access request.
   */
  cancel(requestId: string): Promise<void> {
    return apiClient.delete(`/api/users/me/access-requests/${requestId}`);
  },

  /**
   * List access requests for a school (school admin only).
   */
  list(
    schoolId: string,
    status?: AccessRequestStatus,
  ): Promise<AccessRequestSummary[]> {
    const params = status ? `?status=${status}` : "";
    return apiClient.get(`/api/schools/${schoolId}/access-requests${params}`);
  },

  /**
   * Get a single access request (school admin only).
   */
  get(schoolId: string, requestId: string): Promise<AccessRequestResponse> {
    return apiClient.get(
      `/api/schools/${schoolId}/access-requests/${requestId}`,
    );
  },

  /**
   * Review (approve/reject) an access request (school admin only).
   */
  review(
    schoolId: string,
    requestId: string,
    data: ReviewAccessRequestRequest,
  ): Promise<AccessRequestResponse> {
    return apiClient.put(
      `/api/schools/${schoolId}/access-requests/${requestId}`,
      data,
    );
  },
};
