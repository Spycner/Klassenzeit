/**
 * React Query hooks for Timetable Solver
 *
 * Provides data fetching and mutation hooks for the Timefold solver.
 * Supports polling while solving, and automatic cache invalidation.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { solverApi } from "../services";
import type { SolverJobResponse, TimetableSolutionResponse } from "../types";
import { queryKeys } from "./query-client";

/** Default polling interval while solver is running (in milliseconds) */
const POLLING_INTERVAL_MS = 2000;

/**
 * Fetches the current solver status for a term.
 * Supports polling while the solver is actively running.
 *
 * @param schoolId - The unique identifier of the school (query is disabled if undefined)
 * @param termId - The unique identifier of the term (query is disabled if undefined)
 * @param options - Optional configuration
 * @param options.enabled - Whether the query should run (default: true)
 * @param options.polling - Whether to poll while status is SOLVING (default: false)
 * @returns Query result containing the solver job status
 * @example
 * ```tsx
 * function SolverPanel({ schoolId, termId }: Props) {
 *   const { data: status } = useSolverStatus(schoolId, termId, { polling: true });
 *
 *   if (status?.status === "SOLVING") {
 *     return <div>Solving... Score: {status.score}</div>;
 *   }
 *
 *   return <div>Status: {status?.status}</div>;
 * }
 * ```
 */
export function useSolverStatus(
  schoolId: string | undefined,
  termId: string | undefined,
  options?: { enabled?: boolean; polling?: boolean },
) {
  const { enabled = true, polling = false } = options ?? {};

  return useQuery<SolverJobResponse>({
    queryKey: queryKeys.solver.status(schoolId!, termId!),
    queryFn: () => solverApi.getStatus(schoolId!, termId!),
    enabled: !!schoolId && !!termId && enabled,
    // Poll every 2 seconds while solving, otherwise stop polling
    refetchInterval: (query) => {
      if (!polling) return false;
      return query.state.data?.status === "SOLVING"
        ? POLLING_INTERVAL_MS
        : false;
    },
  });
}

/**
 * Fetches the current best solution for a term.
 * Should only be called when a solution is available (after solving has started).
 *
 * @param schoolId - The unique identifier of the school (query is disabled if undefined)
 * @param termId - The unique identifier of the term (query is disabled if undefined)
 * @param options - Optional configuration
 * @param options.enabled - Whether the query should run (default: true)
 * @returns Query result containing the solution with all assignments
 * @example
 * ```tsx
 * function SolutionPreview({ schoolId, termId }: Props) {
 *   const { data: status } = useSolverStatus(schoolId, termId);
 *   const { data: solution } = useSolution(schoolId, termId, {
 *     enabled: status?.status === "SOLVED",
 *   });
 *
 *   return (
 *     <div>
 *       <p>Score: {solution?.score}</p>
 *       <p>Assignments: {solution?.assignments.length}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSolution(
  schoolId: string | undefined,
  termId: string | undefined,
  options?: { enabled?: boolean },
) {
  const { enabled = true } = options ?? {};

  return useQuery<TimetableSolutionResponse>({
    queryKey: queryKeys.solver.solution(schoolId!, termId!),
    queryFn: () => solverApi.getSolution(schoolId!, termId!),
    enabled: !!schoolId && !!termId && enabled,
  });
}

/**
 * Starts the timetable solver for a term.
 * On success, automatically invalidates the solver status cache.
 *
 * @param schoolId - The unique identifier of the school
 * @param termId - The unique identifier of the term
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function GenerateButton({ schoolId, termId }: Props) {
 *   const startSolving = useStartSolving(schoolId, termId);
 *
 *   return (
 *     <button
 *       onClick={() => startSolving.mutate()}
 *       disabled={startSolving.isPending}
 *     >
 *       Generate Timetable
 *     </button>
 *   );
 * }
 * ```
 */
export function useStartSolving(schoolId: string, termId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => solverApi.startSolving(schoolId, termId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.solver.status(schoolId, termId),
      });
    },
  });
}

/**
 * Stops the solver early if it's currently running.
 * On success, automatically invalidates the solver status cache.
 *
 * @param schoolId - The unique identifier of the school
 * @param termId - The unique identifier of the term
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function StopButton({ schoolId, termId }: Props) {
 *   const stopSolving = useStopSolving(schoolId, termId);
 *
 *   return (
 *     <button onClick={() => stopSolving.mutate()}>
 *       Stop Solver
 *     </button>
 *   );
 * }
 * ```
 */
export function useStopSolving(schoolId: string, termId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => solverApi.stopSolving(schoolId, termId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.solver.status(schoolId, termId),
      });
    },
  });
}

/**
 * Applies the current solution to the database, persisting all lesson assignments.
 * On success, automatically invalidates solver and lessons caches.
 *
 * @param schoolId - The unique identifier of the school
 * @param termId - The unique identifier of the term
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function ApplyButton({ schoolId, termId }: Props) {
 *   const applySolution = useApplySolution(schoolId, termId);
 *
 *   return (
 *     <button
 *       onClick={() => applySolution.mutate(undefined, {
 *         onSuccess: () => toast.success("Timetable applied!"),
 *       })}
 *       disabled={applySolution.isPending}
 *     >
 *       Apply Solution
 *     </button>
 *   );
 * }
 * ```
 */
export function useApplySolution(schoolId: string, termId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => solverApi.applySolution(schoolId, termId),
    onSuccess: () => {
      // Invalidate solver status (no longer has solution to apply)
      queryClient.invalidateQueries({
        queryKey: queryKeys.solver.status(schoolId, termId),
      });
      // Invalidate solution cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.solver.solution(schoolId, termId),
      });
      // Invalidate lessons cache (assignments have changed)
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessons.all(schoolId, termId),
      });
    },
  });
}
