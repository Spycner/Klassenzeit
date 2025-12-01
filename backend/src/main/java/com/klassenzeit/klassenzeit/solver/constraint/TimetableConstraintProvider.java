package com.klassenzeit.klassenzeit.solver.constraint;

import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;

/**
 * Defines constraints for timetabling optimization.
 *
 * <p>Hard constraints must be satisfied (violations make the solution invalid):
 *
 * <ul>
 *   <li>Teacher cannot teach two lessons at the same time
 *   <li>Room cannot host two lessons at the same time
 *   <li>Class cannot have two lessons at the same time
 *   <li>Teacher cannot teach when blocked
 * </ul>
 *
 * <p>Soft constraints are optimized (violations are minimized):
 *
 * <ul>
 *   <li>Teacher prefers certain time slots
 *   <li>Minimize gaps in schedules
 * </ul>
 *
 * <p>Note: Actual constraint implementations will be added in B-011.
 */
public class TimetableConstraintProvider implements ConstraintProvider {

  @Override
  public Constraint[] defineConstraints(ConstraintFactory constraintFactory) {
    // Placeholder - constraints will be implemented in B-011: Timetabling Algorithm
    return new Constraint[] {};
  }
}
