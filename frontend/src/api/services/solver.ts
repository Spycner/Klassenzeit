/**
 * Solver API Service
 *
 * Provides methods for interacting with the Timefold timetable solver.
 * Supports starting/stopping the solver, polling status, fetching solutions,
 * and applying solutions to persist lesson assignments.
 */

import { apiClient } from "../client";
import type { SolverJobResponse, TimetableSolutionResponse } from "../types";

const getBasePath = (schoolId: string, termId: string) =>
  `/api/schools/${schoolId}/terms/${termId}/solver`;

export const solverApi = {
  /**
   * Starts the timetable solver for a term.
   * The solver runs asynchronously; poll status to track progress.
   *
   * @param schoolId - The unique identifier (UUID) of the school
   * @param termId - The unique identifier (UUID) of the term to solve
   * @returns Promise resolving to the initial solver job status
   * @throws {ClientError} When the school or term is not found (404), or no lessons exist (400)
   * @throws {ClientError} When solver is already running for this term (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const job = await solverApi.startSolving("school-uuid", "term-uuid");
   * console.log(job.status); // "SOLVING"
   * ```
   */
  startSolving(schoolId: string, termId: string): Promise<SolverJobResponse> {
    return apiClient.post<SolverJobResponse>(
      `${getBasePath(schoolId, termId)}/solve`,
    );
  },

  /**
   * Gets the current status of the solver for a term.
   * Use this to poll for progress while the solver is running.
   *
   * @param schoolId - The unique identifier (UUID) of the school
   * @param termId - The unique identifier (UUID) of the term
   * @returns Promise resolving to the current solver job status
   * @throws {ClientError} When the school or term is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const status = await solverApi.getStatus("school-uuid", "term-uuid");
   * if (status.status === "SOLVING") {
   *   console.log(`Score: ${status.score}`);
   * }
   * ```
   */
  getStatus(schoolId: string, termId: string): Promise<SolverJobResponse> {
    return apiClient.get<SolverJobResponse>(
      `${getBasePath(schoolId, termId)}/status`,
    );
  },

  /**
   * Stops the solver early if it's currently running.
   * The current best solution will still be available.
   *
   * @param schoolId - The unique identifier (UUID) of the school
   * @param termId - The unique identifier (UUID) of the term
   * @returns Promise resolving when the solver has been stopped
   * @throws {ClientError} When the school or term is not found (404)
   * @throws {ClientError} When solver is not running (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await solverApi.stopSolving("school-uuid", "term-uuid");
   * // Status will now be TERMINATED_EARLY
   * ```
   */
  stopSolving(schoolId: string, termId: string): Promise<void> {
    return apiClient.post<void>(`${getBasePath(schoolId, termId)}/stop`);
  },

  /**
   * Gets the current best solution.
   * Available after solving has started (even while still solving).
   *
   * @param schoolId - The unique identifier (UUID) of the school
   * @param termId - The unique identifier (UUID) of the term
   * @returns Promise resolving to the solution with all lesson assignments
   * @throws {ClientError} When the school or term is not found (404)
   * @throws {ClientError} When no solution is available yet (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const solution = await solverApi.getSolution("school-uuid", "term-uuid");
   * console.log(`${solution.assignments.length} lessons scheduled`);
   * console.log(`Violations: ${solution.violations.length}`);
   * ```
   */
  getSolution(
    schoolId: string,
    termId: string,
  ): Promise<TimetableSolutionResponse> {
    return apiClient.get<TimetableSolutionResponse>(
      `${getBasePath(schoolId, termId)}/solution`,
    );
  },

  /**
   * Applies the current solution to the database.
   * This persists all lesson time slot and room assignments.
   *
   * @param schoolId - The unique identifier (UUID) of the school
   * @param termId - The unique identifier (UUID) of the term
   * @returns Promise resolving when the solution has been applied
   * @throws {ClientError} When the school or term is not found (404)
   * @throws {ClientError} When no solution is available to apply (400)
   * @throws {ClientError} When solution has hard violations (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await solverApi.applySolution("school-uuid", "term-uuid");
   * // Lesson assignments are now persisted
   * ```
   */
  applySolution(schoolId: string, termId: string): Promise<void> {
    return apiClient.post<void>(`${getBasePath(schoolId, termId)}/apply`);
  },
};
