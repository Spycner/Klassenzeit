import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AccessRequestResponse,
  type AccessRequestStatus,
  type AccessRequestSummary,
  accessRequestsApi,
  type CreateAccessRequestRequest,
  type ReviewAccessRequestRequest,
} from "../services/access-requests";

/**
 * Hook to list access requests for a school.
 * Only usable by school admins.
 */
export function useAccessRequests(
  schoolId: string | undefined,
  status?: AccessRequestStatus,
) {
  return useQuery<AccessRequestSummary[]>({
    queryKey: ["schools", schoolId, "access-requests", { status }],
    queryFn: () => accessRequestsApi.list(schoolId!, status),
    enabled: !!schoolId,
  });
}

/**
 * Hook to get a single access request.
 */
export function useAccessRequest(
  schoolId: string | undefined,
  requestId: string | undefined,
) {
  return useQuery<AccessRequestResponse>({
    queryKey: ["schools", schoolId, "access-requests", requestId],
    queryFn: () => accessRequestsApi.get(schoolId!, requestId!),
    enabled: !!schoolId && !!requestId,
  });
}

/**
 * Hook to create an access request.
 */
export function useCreateAccessRequest(schoolId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAccessRequestRequest) =>
      accessRequestsApi.create(schoolId!, data),
    onSuccess: () => {
      // Invalidate access requests list
      queryClient.invalidateQueries({
        queryKey: ["schools", schoolId, "access-requests"],
      });
    },
  });
}

/**
 * Hook to cancel own access request.
 */
export function useCancelAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => accessRequestsApi.cancel(requestId),
    onSuccess: () => {
      // Invalidate user's profile to update pending requests
      queryClient.invalidateQueries({ queryKey: ["users", "me"] });
    },
  });
}

/**
 * Hook to review (approve/reject) an access request.
 */
export function useReviewAccessRequest(schoolId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      data,
    }: {
      requestId: string;
      data: ReviewAccessRequestRequest;
    }) => accessRequestsApi.review(schoolId!, requestId, data),
    onSuccess: () => {
      // Invalidate access requests list
      queryClient.invalidateQueries({
        queryKey: ["schools", schoolId, "access-requests"],
      });
      // Also invalidate members list since approval adds a member
      queryClient.invalidateQueries({
        queryKey: ["schools", schoolId, "members"],
      });
    },
  });
}
