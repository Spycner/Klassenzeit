package com.klassenzeit.klassenzeit.solver.dto;

import java.util.List;
import java.util.UUID;

/**
 * Details of a constraint violation in the solver solution.
 *
 * @param constraintName the name of the violated constraint
 * @param score the score impact of this violation (e.g., "-1hard" or "-2soft")
 * @param affectedLessonIds IDs of lessons involved in this violation
 */
public record ConstraintViolationDto(
    String constraintName, String score, List<UUID> affectedLessonIds) {}
