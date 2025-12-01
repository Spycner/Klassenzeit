# F-019: Timetable Solver Integration

## Description

Integrate the Timefold solver API into the frontend to allow users to generate and manage timetables. This includes starting/stopping the solver, monitoring progress, reviewing solutions, and applying them.

## Acceptance Criteria

- [ ] Generate TypeScript API client for solver endpoints (run `npm run generate-api`)
- [ ] Create solver service hooks using React Query:
  - [ ] `useStartSolving` - Start solver for a term
  - [ ] `useSolverStatus` - Poll for solver status (with auto-refresh while solving)
  - [ ] `useStopSolving` - Stop solver early
  - [ ] `useSolution` - Fetch current best solution
  - [ ] `useApplySolution` - Apply solution to database
- [ ] Create Solver UI components:
  - [ ] `SolverPanel` - Main solver control panel
  - [ ] `SolverStatus` - Status indicator with score display
  - [ ] `SolverProgress` - Progress visualization (time elapsed, moves/sec)
  - [ ] `SolutionPreview` - Preview solution before applying
  - [ ] `ViolationsDisplay` - Show constraint violations
- [ ] Integrate solver into timetable page:
  - [ ] "Generate Timetable" button to start solving
  - [ ] Real-time status updates while solving
  - [ ] Review solution with assignment preview
  - [ ] "Apply" button to persist solution
- [ ] Handle error states (no lessons, solver already running, etc.)

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
enum SolveStatus {
  NOT_SOLVING = 'NOT_SOLVING',
  SOLVING = 'SOLVING',
  TERMINATED_EARLY = 'TERMINATED_EARLY',
  SOLVED = 'SOLVED'
}

interface SolverJobResponse {
  termId: string;
  status: SolveStatus;
  score: string | null;        // e.g., "0hard/-5soft"
  hardViolations: number | null;
  softPenalties: number | null;
}

interface LessonAssignment {
  lessonId: string;
  schoolClassId: string;
  schoolClassName: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  timeSlotId: string | null;
  dayOfWeek: number | null;    // 0-4 for Mon-Fri
  period: number | null;       // 1-based period number
  roomId: string | null;
  roomName: string | null;
  weekPattern: 'EVERY' | 'A' | 'B';
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

### React Query Hooks Pattern
```typescript
// Poll status while solving
const { data: status } = useQuery({
  queryKey: ['solver', 'status', termId],
  queryFn: () => solverApi.getStatus(schoolId, termId),
  refetchInterval: (data) =>
    data?.status === 'SOLVING' ? 1000 : false, // Poll every second while solving
});

// Start solving mutation
const startSolving = useMutation({
  mutationFn: () => solverApi.startSolving(schoolId, termId),
  onSuccess: () => {
    queryClient.invalidateQueries(['solver', 'status', termId]);
  },
});
```

### UI States
1. **Idle**: "Generate Timetable" button enabled
2. **Solving**: Progress indicator, score updates, "Stop" button
3. **Solved**: Solution preview, "Apply" button, "Re-generate" option
4. **Error**: Error message with retry option

## Dependencies

- [B-012: Timefold Solver Service & API](../../done/backend/B-012-schedule-validation.md) ✅
- [F-017: Timetable Views](F-017-timetable-views.md)

## Notes

### Solver Performance (from backend tests)
- Construction heuristic: ~6-26ms for initial solution
- Local search: 200,000-540,000 moves/sec
- Default time limit: 5 minutes (configurable in backend)
- Early termination: When `0hard/*soft` score is reached

### UX Considerations
- Show elapsed time while solving
- Display current score in human-readable format
- Highlight constraint violations in solution preview
- Allow re-running solver with different parameters (future)
