package com.klassenzeit.klassenzeit.solver.dto;

import java.util.List;
import java.util.UUID;

/**
 * Full timetable solution from the solver.
 *
 * @param termId the term ID that was solved
 * @param score the final score as string (e.g., "0hard/-5soft")
 * @param hardViolations number of hard constraint violations
 * @param softPenalties total soft constraint penalty
 * @param assignments list of all lesson assignments
 * @param violations list of constraint violations (for debugging)
 */
public record TimetableSolutionResponse(
    UUID termId,
    String score,
    Integer hardViolations,
    Integer softPenalties,
    List<LessonAssignment> assignments,
    List<ConstraintViolationDto> violations) {}
