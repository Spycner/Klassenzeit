package com.klassenzeit.klassenzeit.solver.dto;

import java.util.UUID;

/**
 * Response containing the current status of a solver job.
 *
 * @param termId the term ID being solved
 * @param status current solving status
 * @param score current best score as string (e.g., "0hard/-5soft")
 * @param hardViolations number of hard constraint violations (null if not yet available)
 * @param softPenalties total soft constraint penalty (null if not yet available)
 */
public record SolverJobResponse(
    UUID termId, SolveStatus status, String score, Integer hardViolations, Integer softPenalties) {}
