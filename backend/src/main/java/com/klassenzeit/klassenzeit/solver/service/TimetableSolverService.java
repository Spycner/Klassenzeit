package com.klassenzeit.klassenzeit.solver.service;

import ai.timefold.solver.core.api.solver.SolverManager;
import ai.timefold.solver.core.api.solver.SolverStatus;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.lesson.Lesson;
import com.klassenzeit.klassenzeit.lesson.LessonRepository;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.room.RoomRepository;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.school.TermRepository;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClassRepository;
import com.klassenzeit.klassenzeit.solver.domain.PlanningLesson;
import com.klassenzeit.klassenzeit.solver.domain.Timetable;
import com.klassenzeit.klassenzeit.solver.dto.ConstraintViolationDto;
import com.klassenzeit.klassenzeit.solver.dto.LessonAssignment;
import com.klassenzeit.klassenzeit.solver.dto.SolveStatus;
import com.klassenzeit.klassenzeit.solver.dto.SolverJobResponse;
import com.klassenzeit.klassenzeit.solver.dto.TimetableSolutionResponse;
import com.klassenzeit.klassenzeit.solver.mapper.TimetableMapper;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.subject.SubjectRepository;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.teacher.TeacherRepository;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import com.klassenzeit.klassenzeit.timeslot.TimeSlotRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for running the Timefold solver on timetabling problems. */
@Service
@Transactional(readOnly = true)
public class TimetableSolverService {

  private final SolverManager<Timetable, UUID> solverManager;
  private final TimetableMapper timetableMapper;
  private final TermRepository termRepository;
  private final TimeSlotRepository timeSlotRepository;
  private final RoomRepository roomRepository;
  private final TeacherRepository teacherRepository;
  private final SchoolClassRepository schoolClassRepository;
  private final SubjectRepository subjectRepository;
  private final LessonRepository lessonRepository;

  /** Cache of best solutions found during solving. */
  private final ConcurrentMap<UUID, Timetable> bestSolutions = new ConcurrentHashMap<>();

  /** Timestamps for when solutions were last updated (for TTL cleanup). */
  private final ConcurrentMap<UUID, Instant> solutionTimestamps = new ConcurrentHashMap<>();

  /** Time-to-live for cached solutions (30 minutes). */
  private static final Duration SOLUTION_TTL = Duration.ofMinutes(30);

  public TimetableSolverService(
      SolverManager<Timetable, UUID> solverManager,
      TimetableMapper timetableMapper,
      TermRepository termRepository,
      TimeSlotRepository timeSlotRepository,
      RoomRepository roomRepository,
      TeacherRepository teacherRepository,
      SchoolClassRepository schoolClassRepository,
      SubjectRepository subjectRepository,
      LessonRepository lessonRepository) {
    this.solverManager = solverManager;
    this.timetableMapper = timetableMapper;
    this.termRepository = termRepository;
    this.timeSlotRepository = timeSlotRepository;
    this.roomRepository = roomRepository;
    this.teacherRepository = teacherRepository;
    this.schoolClassRepository = schoolClassRepository;
    this.subjectRepository = subjectRepository;
    this.lessonRepository = lessonRepository;
  }

  /**
   * Starts solving a timetable for the given term.
   *
   * @param schoolId the school ID (for validation)
   * @param termId the term ID to solve
   * @return solver job response with initial status
   * @throws EntityNotFoundException if term not found or doesn't belong to school
   * @throws IllegalStateException if solver is already running for this term
   * @throws IllegalArgumentException if there are no lessons to solve
   */
  public SolverJobResponse startSolving(UUID schoolId, UUID termId) {
    Term term = getTermValidated(schoolId, termId);

    // Check if already solving
    SolverStatus status = solverManager.getSolverStatus(termId);
    if (status == SolverStatus.SOLVING_ACTIVE || status == SolverStatus.SOLVING_SCHEDULED) {
      throw new IllegalStateException("Solver is already running for term: " + termId);
    }

    // Load problem data
    Timetable problem = loadProblem(term);

    if (problem.getLessons().isEmpty()) {
      throw new IllegalArgumentException("No lessons to solve for term: " + termId);
    }

    // Clear any previous solution
    bestSolutions.remove(termId);
    solutionTimestamps.remove(termId);

    // Start async solving
    solverManager
        .solveBuilder()
        .withProblemId(termId)
        .withProblem(problem)
        .withBestSolutionConsumer(solution -> storeSolution(termId, solution))
        .withFinalBestSolutionConsumer(solution -> storeSolution(termId, solution))
        .run();

    return new SolverJobResponse(termId, SolveStatus.SOLVING, null, null, null);
  }

  /**
   * Gets the current status of a solving job.
   *
   * @param schoolId the school ID (for validation)
   * @param termId the term ID
   * @return solver job response with current status and score
   */
  public SolverJobResponse getStatus(UUID schoolId, UUID termId) {
    getTermValidated(schoolId, termId);

    SolverStatus solverStatus = solverManager.getSolverStatus(termId);
    SolveStatus status = mapSolverStatus(solverStatus, termId);

    Timetable best = bestSolutions.get(termId);
    if (best == null || best.getScore() == null) {
      return new SolverJobResponse(termId, status, null, null, null);
    }

    return new SolverJobResponse(
        termId,
        status,
        best.getScore().toString(),
        Math.abs(best.getScore().hardScore()),
        Math.abs(best.getScore().softScore()));
  }

  /**
   * Stops a running solver job.
   *
   * @param schoolId the school ID (for validation)
   * @param termId the term ID
   */
  public void stopSolving(UUID schoolId, UUID termId) {
    getTermValidated(schoolId, termId);
    solverManager.terminateEarly(termId);
  }

  /**
   * Gets the current best solution.
   *
   * @param schoolId the school ID (for validation)
   * @param termId the term ID
   * @return the timetable solution response
   * @throws IllegalStateException if no solution is available
   */
  public TimetableSolutionResponse getSolution(UUID schoolId, UUID termId) {
    getTermValidated(schoolId, termId);

    Timetable solution = bestSolutions.get(termId);
    if (solution == null) {
      throw new IllegalStateException("No solution available for term: " + termId);
    }

    return toSolutionResponse(solution);
  }

  /**
   * Applies the current best solution to the database.
   *
   * @param schoolId the school ID (for validation)
   * @param termId the term ID
   * @throws IllegalStateException if no solution is available or solver is still running
   */
  @Transactional
  public void applySolution(UUID schoolId, UUID termId) {
    getTermValidated(schoolId, termId);

    // Check solver is not still running
    SolverStatus status = solverManager.getSolverStatus(termId);
    if (status == SolverStatus.SOLVING_ACTIVE || status == SolverStatus.SOLVING_SCHEDULED) {
      throw new IllegalStateException("Cannot apply solution while solver is still running");
    }

    Timetable solution = bestSolutions.get(termId);
    if (solution == null) {
      throw new IllegalStateException("No solution available to apply for term: " + termId);
    }

    // Extract assignments and apply to database
    Map<UUID, TimetableMapper.LessonAssignment> assignments =
        timetableMapper.extractAssignments(solution);

    assignments.forEach(this::applyAssignmentToLesson);

    // Clean up the solution from cache after applying
    bestSolutions.remove(termId);
    solutionTimestamps.remove(termId);
  }

  /**
   * Cleans up stale solutions that have exceeded the TTL. Runs every 5 minutes to prevent memory
   * accumulation from abandoned solver jobs.
   */
  @Scheduled(fixedRate = 300_000) // Every 5 minutes
  public void cleanupStaleSolutions() {
    Instant cutoff = Instant.now().minus(SOLUTION_TTL);
    solutionTimestamps
        .entrySet()
        .removeIf(
            entry -> {
              if (entry.getValue().isBefore(cutoff)) {
                bestSolutions.remove(entry.getKey());
                return true;
              }
              return false;
            });
  }

  // ========== Private Helper Methods ==========

  private void storeSolution(UUID termId, Timetable solution) {
    bestSolutions.put(termId, solution);
    solutionTimestamps.put(termId, Instant.now());
  }

  private void applyAssignmentToLesson(UUID lessonId, TimetableMapper.LessonAssignment assignment) {
    Lesson lesson =
        lessonRepository.findById(lessonId).orElseThrow(() -> entityNotFound("Lesson", lessonId));

    if (assignment.timeSlotId() != null) {
      TimeSlot timeSlot =
          timeSlotRepository
              .findById(assignment.timeSlotId())
              .orElseThrow(() -> entityNotFound("TimeSlot", assignment.timeSlotId()));
      lesson.setTimeslot(timeSlot);
    } else {
      lesson.setTimeslot(null);
    }

    if (assignment.roomId() != null) {
      Room room =
          roomRepository
              .findById(assignment.roomId())
              .orElseThrow(() -> entityNotFound("Room", assignment.roomId()));
      lesson.setRoom(room);
    } else {
      lesson.setRoom(null);
    }

    lessonRepository.save(lesson);
  }

  private static EntityNotFoundException entityNotFound(String entityType, UUID entityId) {
    return new EntityNotFoundException(entityType, entityId);
  }

  private Term getTermValidated(UUID schoolId, UUID termId) {
    Term term =
        termRepository
            .findById(termId)
            .orElseThrow(() -> new EntityNotFoundException("Term", termId));

    // Validate term belongs to school (Term -> SchoolYear -> School)
    UUID termSchoolId = term.getSchoolYear().getSchool().getId();
    if (!termSchoolId.equals(schoolId)) {
      throw new EntityNotFoundException("Term", termId);
    }

    return term;
  }

  private Timetable loadProblem(Term term) {
    UUID schoolId = term.getSchoolYear().getSchool().getId();

    List<TimeSlot> timeSlots = timeSlotRepository.findBySchoolId(schoolId);
    List<Room> rooms = roomRepository.findBySchoolId(schoolId);
    // Two queries to avoid Hibernate MultipleBagFetchException (can't fetch multiple Lists)
    List<Teacher> teachers = teacherRepository.findBySchoolIdWithQualifications(schoolId);
    teacherRepository.findBySchoolIdWithAvailabilities(
        schoolId); // Populates availabilities in cache
    List<SchoolClass> schoolClasses = schoolClassRepository.findBySchoolId(schoolId);
    List<Subject> subjects = subjectRepository.findBySchoolId(schoolId);
    List<Lesson> lessons = lessonRepository.findByTermId(term.getId());

    return timetableMapper.toTimetable(
        term, timeSlots, rooms, teachers, schoolClasses, subjects, lessons);
  }

  private SolveStatus mapSolverStatus(SolverStatus solverStatus, UUID termId) {
    return switch (solverStatus) {
      case SOLVING_ACTIVE, SOLVING_SCHEDULED -> SolveStatus.SOLVING;
      case NOT_SOLVING -> {
        // Check if we have a solution (means it completed)
        if (bestSolutions.containsKey(termId)) {
          yield SolveStatus.SOLVED;
        }
        yield SolveStatus.NOT_SOLVING;
      }
    };
  }

  private TimetableSolutionResponse toSolutionResponse(Timetable solution) {
    List<LessonAssignment> assignments =
        solution.getLessons().stream().map(this::toLessonAssignment).toList();

    // Get constraint violations from score analysis (simplified - just report counts)
    List<ConstraintViolationDto> violations = List.of();

    return new TimetableSolutionResponse(
        solution.getTermId(),
        solution.getScore() != null ? solution.getScore().toString() : null,
        solution.getScore() != null ? Math.abs(solution.getScore().hardScore()) : null,
        solution.getScore() != null ? Math.abs(solution.getScore().softScore()) : null,
        assignments,
        violations);
  }

  private LessonAssignment toLessonAssignment(PlanningLesson lesson) {
    return new LessonAssignment(
        lesson.getId(),
        lesson.getSchoolClass().getId(),
        lesson.getSchoolClass().getName(),
        lesson.getTeacher().getId(),
        lesson.getTeacher().getFullName(),
        lesson.getSubject().getId(),
        lesson.getSubject().getName(),
        lesson.getTimeSlot() != null ? lesson.getTimeSlot().getId() : null,
        lesson.getTimeSlot() != null ? lesson.getTimeSlot().getDayOfWeek() : null,
        lesson.getTimeSlot() != null ? lesson.getTimeSlot().getPeriod() : null,
        lesson.getRoom() != null ? lesson.getRoom().getId() : null,
        lesson.getRoom() != null ? lesson.getRoom().getName() : null,
        lesson.getWeekPattern());
  }
}
