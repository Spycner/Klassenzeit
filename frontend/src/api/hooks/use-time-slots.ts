/**
 * React Query hooks for Time Slots
 *
 * Provides data fetching and mutation hooks for managing time slots.
 * All hooks automatically handle caching, invalidation, and refetching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { timeSlotsApi } from "../services";
import type {
  CreateTimeSlotRequest,
  TimeSlotResponse,
  TimeSlotSummary,
  UpdateTimeSlotRequest,
} from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all time slots for a specific school.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @returns Query result containing an array of time slot summaries
 */
export function useTimeSlots(schoolId: string | undefined) {
  return useQuery<TimeSlotSummary[]>({
    queryKey: queryKeys.timeSlots.all(schoolId!),
    queryFn: () => timeSlotsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/**
 * Fetches a single time slot by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param id - The unique identifier of the time slot (query is disabled if undefined)
 * @returns Query result containing full time slot details
 */
export function useTimeSlot(
  schoolId: string | undefined,
  id: string | undefined,
) {
  return useQuery<TimeSlotResponse>({
    queryKey: queryKeys.timeSlots.detail(schoolId!, id!),
    queryFn: () => timeSlotsApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/**
 * Creates a new time slot within a school.
 * On success, automatically invalidates the time slots list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useCreateTimeSlot(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTimeSlotRequest) =>
      timeSlotsApi.create(schoolId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeSlots.all(schoolId),
      });
    },
  });
}

/**
 * Updates an existing time slot.
 * On success, automatically invalidates both the time slots list and detail cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useUpdateTimeSlot(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTimeSlotRequest }) =>
      timeSlotsApi.update(schoolId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeSlots.all(schoolId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeSlots.detail(schoolId, id),
      });
    },
  });
}

/**
 * Deletes a time slot.
 * On success, automatically invalidates the time slots list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useDeleteTimeSlot(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => timeSlotsApi.delete(schoolId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeSlots.all(schoolId),
      });
    },
  });
}
