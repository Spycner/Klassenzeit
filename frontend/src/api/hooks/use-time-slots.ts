/**
 * React Query hooks for Time Slots
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

/** Fetch all time slots for a school */
export function useTimeSlots(schoolId: string | undefined) {
  return useQuery<TimeSlotSummary[]>({
    queryKey: queryKeys.timeSlots.all(schoolId!),
    queryFn: () => timeSlotsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/** Fetch a single time slot by ID */
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

/** Create a new time slot */
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

/** Update an existing time slot */
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

/** Delete a time slot */
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
