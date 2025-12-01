package com.klassenzeit.klassenzeit.solver.dto;

/** Status of a timetable solving job. */
public enum SolveStatus {
  /** No solving job has been started for this term. */
  NOT_SOLVING,

  /** Solving is currently in progress. */
  SOLVING,

  /** Solving was terminated early by user request. */
  TERMINATED_EARLY,

  /** Solving completed normally (reached termination condition). */
  SOLVED
}
