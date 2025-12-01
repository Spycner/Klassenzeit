# F-020: Solver UI Components

## Description

Create the UI components for controlling and displaying the timetable solver. This includes the solver control panel, status indicators, progress visualization, solution preview, and constraint violations display.

## Acceptance Criteria

- [ ] Create Solver UI components:
  - [ ] `SolverPanel` - Main solver control panel with start/stop buttons
  - [ ] `SolverStatus` - Status indicator with score display
  - [ ] `SolverProgress` - Progress visualization (time elapsed, current score)
  - [ ] `SolutionPreview` - Preview solution before applying
  - [ ] `ViolationsDisplay` - Show constraint violations with details
- [ ] Add required shadcn/ui components:
  ```bash
  npx shadcn@latest add badge progress card alert
  ```
- [ ] Integrate solver into timetable page (when F-017 is complete):
  - [ ] "Generate Timetable" button to start solving
  - [ ] Real-time status updates while solving
  - [ ] Review solution with assignment preview
  - [ ] "Apply" button to persist solution
- [ ] Handle error states (no lessons, solver already running, etc.)

## Technical Details

### UI States
1. **Idle** (`NOT_SOLVING`): "Generate Timetable" button enabled
2. **Solving** (`SOLVING`): Progress indicator, score updates, "Stop" button
3. **Solved** (`SOLVED` or `TERMINATED_EARLY`): Solution preview, "Apply" button, "Re-generate" option
4. **Error**: Error message with retry option

### Component Structure
```
components/
  solver/
    SolverPanel.tsx         # Main control panel
    SolverStatus.tsx        # Status badge/indicator
    SolverProgress.tsx      # Progress with elapsed time
    SolutionPreview.tsx     # Preview assignments
    ViolationsDisplay.tsx   # Constraint violations list
    index.ts                # Exports
```

### SolverPanel Component
```tsx
interface SolverPanelProps {
  schoolId: string;
  termId: string;
  onSolutionApplied?: () => void;
}

function SolverPanel({ schoolId, termId, onSolutionApplied }: SolverPanelProps) {
  const { data: status } = useSolverStatus(schoolId, termId, { polling: true });
  const startSolving = useStartSolving(schoolId, termId);
  const stopSolving = useStopSolving(schoolId, termId);
  const applySolution = useApplySolution(schoolId, termId);

  // Render based on status.status
}
```

### Score Display
Parse score string (e.g., "0hard/-15soft") into human-readable format:
- Hard violations: Show as error count
- Soft penalties: Show as quality indicator

### Progress Tracking
- Show elapsed time since solving started
- Display current score while solving
- Optional: Show moves/sec if available from backend

## Dependencies

- [F-019: Timetable Solver API Integration](F-019-solver-integration.md) - API hooks and types
- [F-017: Timetable Views](F-017-timetable-views.md) - Page to integrate into (optional, can create standalone page)

## Notes

### UX Considerations
- Show elapsed time while solving
- Display current score in human-readable format
- Highlight constraint violations in solution preview
- Allow re-running solver with different parameters (future)

### Solver Performance (from backend)
- Construction heuristic: ~6-26ms for initial solution
- Local search: 200,000-540,000 moves/sec
- Default time limit: 5 minutes (configurable in backend)
- Early termination: When `0hard/*soft` score is reached

### Score Interpretation
- `0hard/-15soft` = Valid solution with some soft violations
- `0hard/+5soft` = Valid solution with net positive soft score (many preferred slots used)
- `-3hard/-10soft` = Invalid solution (3 hard violations) - cannot apply

### Constraint Types
Hard constraints (must be 0):
- Teacher conflict
- Room conflict
- Class conflict
- Teacher availability
- Room capacity
- Teacher qualification

Soft constraints (minimize):
- Teacher gaps
- Subject distribution
- Class teacher first period
- Teacher preferred slots (reward)
