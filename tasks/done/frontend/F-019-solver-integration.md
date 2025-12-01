# F-019: Timetable Solver API Integration

## Description

Create the API service layer and React Query hooks for integrating with the Timefold solver backend. This provides the foundation for solver functionality that UI components can consume.

## Acceptance Criteria

- [x] Create solver TypeScript types (`src/api/types/solver.ts`)
- [x] Create solver service (`src/api/services/solver.ts`) with methods:
  - [x] `startSolving` - Start solver for a term
  - [x] `getStatus` - Get current solver status
  - [x] `stopSolving` - Stop solver early
  - [x] `getSolution` - Fetch current best solution
  - [x] `applySolution` - Apply solution to database
- [x] Create React Query hooks (`src/api/hooks/use-solver.ts`):
  - [x] `useStartSolving` - Start solver mutation
  - [x] `useSolverStatus` - Poll for solver status (with auto-refresh while solving)
  - [x] `useStopSolving` - Stop solver mutation
  - [x] `useSolution` - Fetch current best solution
  - [x] `useApplySolution` - Apply solution mutation
- [x] Add solver query keys to `query-client.ts`
- [x] Export all types, services, and hooks from API index files
- [x] Write unit tests for all hooks

## Technical Details

### API Endpoints (Backend B-012)
```
POST /api/schools/{schoolId}/terms/{termId}/solver/solve    → 202 Accepted
GET  /api/schools/{schoolId}/terms/{termId}/solver/status   → SolverJobResponse
POST /api/schools/{schoolId}/terms/{termId}/solver/stop     → 204 No Content
GET  /api/schools/{schoolId}/terms/{termId}/solver/solution → TimetableSolutionResponse
POST /api/schools/{schoolId}/terms/{termId}/solver/apply    → 204 No Content
```

### Response Types
```typescript
type SolveStatus = "NOT_SOLVING" | "SOLVING" | "TERMINATED_EARLY" | "SOLVED";

interface SolverJobResponse {
  termId: string;
  status: SolveStatus;
  score: string | null;        // e.g., "0hard/-5soft"
  hardViolations: number | null;
  softPenalties: number | null;
}

interface TimetableSolutionResponse {
  termId: string;
  score: string;
  hardViolations: number;
  softPenalties: number;
  assignments: LessonAssignment[];
  violations: ConstraintViolationDto[];
}
```

### Files Created
- `src/api/types/solver.ts` - TypeScript types
- `src/api/services/solver.ts` - API service
- `src/api/hooks/use-solver.ts` - React Query hooks
- `src/api/hooks/use-solver.test.tsx` - Unit tests

## Dependencies

- [B-012: Timefold Solver Service & API](../../done/backend/B-012-schedule-validation.md) - Backend API

## Related

- [F-020: Solver UI Components](../../todo/frontend/F-020-solver-ui.md) - UI components that consume these hooks

## Notes

### Polling Behavior
- `useSolverStatus` supports polling via `refetchInterval` option
- Polls every 2 seconds when `polling: true` and status is `SOLVING`
- Automatically stops polling when status changes to `SOLVED` or `TERMINATED_EARLY`

### Cache Invalidation
- `useStartSolving` invalidates status query on success
- `useStopSolving` invalidates status query on success
- `useApplySolution` invalidates status, solution, and lessons queries on success

## Completion Notes

**Completed:** 2024-12-01

### What was implemented
- Solver TypeScript types re-exported from Orval-generated types (`src/api/types/solver.ts`)
- Solver API service with 5 methods for all solver endpoints (`src/api/services/solver.ts`)
- 5 React Query hooks with polling support (`src/api/hooks/use-solver.ts`)
- Query key factory for solver queries (`query-client.ts`)
- 19 unit tests covering all hooks (`use-solver.test.tsx`)

### Key decisions
- Types are re-exported from Orval-generated types (run `npm run generate-api` to sync with backend)
- Polling interval set to 2 seconds while solver is running
- `useApplySolution` invalidates lessons cache since assignments change

### Files created/modified
- `src/api/types/solver.ts` (created)
- `src/api/services/solver.ts` (created)
- `src/api/hooks/use-solver.ts` (created)
- `src/api/hooks/use-solver.test.tsx` (created)
- `src/api/types/index.ts` (modified - export solver types)
- `src/api/services/index.ts` (modified - export solverApi)
- `src/api/hooks/index.ts` (modified - export solver hooks)
- `src/api/hooks/query-client.ts` (modified - add solver query keys)
- `tasks/todo/frontend/F-020-solver-ui.md` (created - new task for UI)
