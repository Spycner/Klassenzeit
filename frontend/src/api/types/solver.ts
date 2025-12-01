/**
 * Solver types for Timefold timetable generation
 *
 * Re-exports generated types from Orval for the solver API.
 * Run `npm run generate-api` to regenerate types from the backend OpenAPI spec.
 */

// Re-export generated solver types
export type {
  ConstraintViolationDto,
  LessonAssignment,
  LessonAssignmentWeekPattern,
  SolverJobResponse,
  TimetableSolutionResponse,
} from "../generated/models";

// Re-export the status enum (both type and value)
export {
  SolverJobResponseStatus,
  type SolverJobResponseStatus as SolveStatus,
} from "../generated/models";
