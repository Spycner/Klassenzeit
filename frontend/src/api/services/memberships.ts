/**
 * School Membership API Service
 *
 * Provides methods for managing school memberships (user access to schools).
 * Only school admins can manage memberships for their school.
 */

import { apiClient } from "../client";
import type {
  CreateMembershipRequest,
  MembershipResponse,
  MembershipSummary,
  UpdateMembershipRequest,
} from "../types";

const basePath = (schoolId: string) => `/api/schools/${schoolId}/members`;

export const membershipsApi = {
  /**
   * Retrieves all members of a school.
   *
   * @param schoolId - The school's unique identifier
   * @returns Promise resolving to an array of membership summaries
   */
  list(schoolId: string): Promise<MembershipSummary[]> {
    return apiClient.get<MembershipSummary[]>(basePath(schoolId));
  },

  /**
   * Retrieves a single membership by ID.
   *
   * @param schoolId - The school's unique identifier
   * @param id - The membership's unique identifier
   * @returns Promise resolving to the full membership details
   */
  get(schoolId: string, id: string): Promise<MembershipResponse> {
    return apiClient.get<MembershipResponse>(`${basePath(schoolId)}/${id}`);
  },

  /**
   * Adds a user to a school with a specific role.
   *
   * @param schoolId - The school's unique identifier
   * @param data - The membership creation data (userId, role, optional linkedTeacherId)
   * @returns Promise resolving to the created membership
   */
  create(
    schoolId: string,
    data: CreateMembershipRequest,
  ): Promise<MembershipResponse> {
    return apiClient.post<MembershipResponse>(basePath(schoolId), data);
  },

  /**
   * Updates a membership's role or linked teacher.
   *
   * @param schoolId - The school's unique identifier
   * @param id - The membership's unique identifier
   * @param data - The update data (role, optional linkedTeacherId)
   * @returns Promise resolving to the updated membership
   */
  update(
    schoolId: string,
    id: string,
    data: UpdateMembershipRequest,
  ): Promise<MembershipResponse> {
    return apiClient.put<MembershipResponse>(
      `${basePath(schoolId)}/${id}`,
      data,
    );
  },

  /**
   * Removes a user from a school.
   *
   * @param schoolId - The school's unique identifier
   * @param id - The membership's unique identifier
   * @returns Promise resolving when the membership is removed
   */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${basePath(schoolId)}/${id}`);
  },
};
