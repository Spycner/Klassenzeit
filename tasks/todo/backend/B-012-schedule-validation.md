# B-012: Timefold Solver Service & API

## Description

Implement the service layer and REST API for the Timefold solver. This provides async solving capabilities with status polling, solution retrieval, and persistence.

## Acceptance Criteria

- [ ] Create solver DTOs in `solver/dto/`:
  - [ ] `SolveStatus.java` - Enum (NOT_STARTED, SOLVING, TERMINATED_EARLY, SOLVED)
  - [ ] `SolverJobResponse.java` - Job ID, status, score, violation count
  - [ ] `TimetableSolutionResponse.java` - Full solution with assignments and violations
  - [ ] `LessonAssignment.java` - Single lesson assignment details
  - [ ] `ConstraintViolation.java` - Violation info for debugging
- [ ] Create `TimetableSolverService.java` in `solver/service/`:
  - [ ] `startSolving(schoolId, termId)` - Start async solve, return job ID
  - [ ] `getStatus(jobId)` - Get current solver status and score
  - [ ] `stopSolving(jobId)` - Terminate early, keep best solution
  - [ ] `getSolution(jobId)` - Get current best solution
  - [ ] `applySolution(schoolId, termId)` - Persist solution to database
- [ ] Create `TimetableSolverController.java` in `solver/controller/`
- [ ] Add solver configuration to `application.yaml`
- [ ] Create `TimetableSolverServiceTest.java`
- [ ] Create `TimetableSolverIntegrationTest.java`

## Technical Details

### REST API Endpoints
```
POST /api/schools/{schoolId}/terms/{termId}/solver/solve
  - Start solving (async)
  - Returns: 202 Accepted with SolverJobResponse

GET /api/schools/{schoolId}/terms/{termId}/solver/status
  - Get current status
  - Returns: SolverJobResponse

POST /api/schools/{schoolId}/terms/{termId}/solver/stop
  - Terminate early
  - Returns: 204 No Content

GET /api/schools/{schoolId}/terms/{termId}/solver/solution
  - Get current best solution
  - Returns: TimetableSolutionResponse

POST /api/schools/{schoolId}/terms/{termId}/solver/apply
  - Persist solution to database
  - Returns: 204 No Content
```

### TimetableSolverService
```java
@Service
public class TimetableSolverService {

    private final SolverManager<Timetable, UUID> solverManager;
    private final TimetableMapper mapper;
    private final ConcurrentHashMap<UUID, Timetable> bestSolutions = new ConcurrentHashMap<>();

    public SolverJobResponse startSolving(UUID schoolId, UUID termId) {
        Timetable problem = loadProblem(schoolId, termId);

        solverManager.solveBuilder()
            .withProblemId(termId)
            .withProblem(problem)
            .withBestSolutionConsumer(solution -> bestSolutions.put(termId, solution))
            .withFinalBestSolutionConsumer(solution -> bestSolutions.put(termId, solution))
            .run();

        return new SolverJobResponse(termId, SolveStatus.SOLVING, null, null);
    }

    public SolverJobResponse getStatus(UUID jobId) {
        SolverStatus status = solverManager.getSolverStatus(jobId);
        Timetable best = bestSolutions.get(jobId);
        return new SolverJobResponse(
            jobId,
            mapStatus(status),
            best != null ? best.getScore().toString() : null,
            best != null ? countViolations(best) : null
        );
    }

    @Transactional
    public void applySolution(UUID schoolId, UUID termId) {
        Timetable solution = bestSolutions.get(termId);
        // Update lessons in database with solved timeSlot and room
        // Clean up bestSolutions map
    }
}
```

### DTOs
```java
public enum SolveStatus {
    NOT_STARTED, SOLVING, TERMINATED_EARLY, SOLVED
}

public record SolverJobResponse(
    UUID jobId,
    SolveStatus status,
    String score,
    Integer violationCount
) {}

public record TimetableSolutionResponse(
    UUID termId,
    String score,
    List<LessonAssignment> assignments,
    List<ConstraintViolation> violations
) {}

public record LessonAssignment(
    UUID lessonId,
    UUID schoolClassId,
    String schoolClassName,
    UUID teacherId,
    String teacherName,
    UUID subjectId,
    String subjectName,
    UUID timeSlotId,
    Short dayOfWeek,
    Short period,
    UUID roomId,
    String roomName,
    WeekPattern weekPattern
) {}

public record ConstraintViolation(
    String constraintName,
    String description,
    List<UUID> affectedLessonIds
) {}
```

### Configuration (application.yaml)
```yaml
timefold:
  solver:
    termination:
      spent-limit: 5m              # Default solve time
      best-score-limit: 0hard/*soft  # Stop if no hard violations
    move-thread-count: AUTO        # Parallel move evaluation
  solver-manager:
    parallel-solver-count: 1       # One solve at a time per JVM
```

### Package Structure
```
solver/
  controller/
    TimetableSolverController.java
  service/
    TimetableSolverService.java
  dto/
    SolveStatus.java
    SolverJobResponse.java
    TimetableSolutionResponse.java
    LessonAssignment.java
    ConstraintViolation.java
```

## Dependencies

- [B-010: Timefold Planning Domain Model](B-010-scheduling-constraints-model.md)
- [B-011: Timefold Constraint Definitions](B-011-timetabling-algorithm.md)

## Blocks

None (Frontend solver UI will be separate task)

## Notes

### Key Design Decisions
- **Async solving**: Solving runs in background, client polls for status
- **In-memory solution store**: Best solutions stored in ConcurrentHashMap (simple for v1, can move to Redis/DB for production)
- **One solver per term**: Use termId as job ID, prevents conflicting solves
- **Apply is separate**: User reviews solution before persisting to database

### Future Enhancements
- Server-Sent Events (SSE) for real-time progress updates
- Solver job persistence in database for resilience across restarts
- Partial solving (pin some lessons, solve others)
- Configurable termination time via API parameter
