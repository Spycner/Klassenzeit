# B-012: Timefold Solver Service & API

## Description

Implement the service layer and REST API for the Timefold solver. This provides async solving capabilities with status polling, solution retrieval, and persistence.

## Acceptance Criteria

- [x] Create solver DTOs in `solver/dto/`:
  - [x] `SolveStatus.java` - Enum (NOT_SOLVING, SOLVING, TERMINATED_EARLY, SOLVED)
  - [x] `SolverJobResponse.java` - termId, status, score, hard/soft violation counts
  - [x] `TimetableSolutionResponse.java` - Full solution with assignments and violations
  - [x] `LessonAssignment.java` - Single lesson assignment details
  - [x] `ConstraintViolationDto.java` - Violation info for debugging
- [x] Create `TimetableSolverService.java` in `solver/service/`:
  - [x] `startSolving(schoolId, termId)` - Start async solve
  - [x] `getStatus(schoolId, termId)` - Get current solver status and score
  - [x] `stopSolving(schoolId, termId)` - Terminate early, keep best solution
  - [x] `getSolution(schoolId, termId)` - Get current best solution
  - [x] `applySolution(schoolId, termId)` - Persist solution to database
- [x] Create `TimetableSolverController.java` in `solver/controller/`
- [x] Add solver configuration to `application.yaml`
- [x] Create `TimetableSolverServiceTest.java`
- [x] Create `TimetableSolverControllerTest.java`

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

## Completion Notes

**Completed**: 2025-12-01

### What was implemented
- All DTOs as Java records in `solver/dto/`
- `TimetableSolverService` with async solving via Timefold's `SolverManager`
- `TimetableSolverController` with 5 REST endpoints
- `GlobalExceptionHandler` updated to handle `IllegalStateException` for conflict (409) vs bad request (400)
- Configuration in `application.yaml` (removed `move-thread-count: AUTO` as it requires enterprise license)
- Comprehensive tests: 13 service tests, 11 controller tests

### Key decisions
- Used `ConcurrentMap<UUID, Timetable>` instead of `ConcurrentHashMap` (PMD rule)
- Removed `move-thread-count: AUTO` from config (requires Timefold Enterprise)
- Multi-tenancy validation: Term -> SchoolYear -> School relationship validated

### Solver Performance
- **Construction Heuristic**: Finds initial feasible solution in ~6-26ms
- **Local Search**: ~200,000-540,000 moves/sec evaluation speed
- **8 lessons test case**: Solved with `0hard/2soft` score in ~12ms construction + 5s local search
- **Move evaluation speed**: 193,000-540,000 moves/sec depending on problem size

### Files created/modified
**New files:**
- `solver/dto/SolveStatus.java`
- `solver/dto/SolverJobResponse.java`
- `solver/dto/LessonAssignment.java`
- `solver/dto/ConstraintViolationDto.java`
- `solver/dto/TimetableSolutionResponse.java`
- `solver/service/TimetableSolverService.java`
- `solver/controller/TimetableSolverController.java`
- `solver/service/TimetableSolverServiceTest.java`
- `solver/controller/TimetableSolverControllerTest.java`

**Modified files:**
- `application.yaml` - Added Timefold configuration
- `common/GlobalExceptionHandler.java` - Added `IllegalStateException` handler
