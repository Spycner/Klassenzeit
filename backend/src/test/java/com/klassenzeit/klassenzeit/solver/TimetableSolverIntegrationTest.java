package com.klassenzeit.klassenzeit.solver;

import static org.assertj.core.api.Assertions.assertThat;

import ai.timefold.solver.core.api.solver.SolverFactory;
import ai.timefold.solver.core.config.solver.SolverConfig;
import ai.timefold.solver.core.config.solver.termination.TerminationConfig;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.solver.constraint.TimetableConstraintProvider;
import com.klassenzeit.klassenzeit.solver.domain.PlanningLesson;
import com.klassenzeit.klassenzeit.solver.domain.PlanningRoom;
import com.klassenzeit.klassenzeit.solver.domain.PlanningSchoolClass;
import com.klassenzeit.klassenzeit.solver.domain.PlanningSubject;
import com.klassenzeit.klassenzeit.solver.domain.PlanningTeacher;
import com.klassenzeit.klassenzeit.solver.domain.PlanningTimeSlot;
import com.klassenzeit.klassenzeit.solver.domain.Timetable;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Integration test that verifies the Timefold solver can find a feasible solution for realistic
 * school timetabling data similar to the development seed data.
 */
class TimetableSolverIntegrationTest {

  private SolverFactory<Timetable> solverFactory;

  // Test data UUIDs (matching seed data pattern)
  private UUID termId;
  private List<PlanningTimeSlot> timeSlots;
  private List<PlanningRoom> rooms;
  private List<PlanningTeacher> teachers;
  private List<PlanningSchoolClass> schoolClasses;
  private List<PlanningSubject> subjects;

  // Subject UUIDs for qualification mapping
  private UUID deutschId;
  private UUID matheId;
  private UUID sachunterrichtId;
  private UUID sportId;
  private UUID kunstId;
  private UUID musikId;

  @BeforeEach
  void setUp() {
    // Configure solver with 5-second termination for tests
    SolverConfig solverConfig =
        new SolverConfig()
            .withSolutionClass(Timetable.class)
            .withEntityClasses(PlanningLesson.class)
            .withConstraintProviderClass(TimetableConstraintProvider.class)
            .withTerminationConfig(new TerminationConfig().withSecondsSpentLimit(5L));

    solverFactory = SolverFactory.create(solverConfig);

    // Initialize IDs
    termId = UUID.randomUUID();
    deutschId = UUID.randomUUID();
    matheId = UUID.randomUUID();
    sachunterrichtId = UUID.randomUUID();
    sportId = UUID.randomUUID();
    kunstId = UUID.randomUUID();
    musikId = UUID.randomUUID();

    // Create test data similar to seed data
    createTimeSlots();
    createRooms();
    createSubjects();
    createTeachers();
    createSchoolClasses();
  }

  @Test
  @DisplayName("Solver finds feasible solution for small school scenario")
  void solver_findsValidSolution_forSmallSchool() {
    // Create lessons - 2 classes, each needs 4 lessons per week (8 total)
    List<PlanningLesson> lessons = createLessonsForSmallSchool();

    Timetable problem =
        new Timetable(termId, timeSlots, rooms, teachers, schoolClasses, subjects, lessons);

    // Solve
    Timetable solution = solverFactory.buildSolver().solve(problem);

    // Verify solution is found
    assertThat(solution).isNotNull();
    assertThat(solution.getScore()).isNotNull();

    // Verify no hard constraint violations (score.hardScore() == 0)
    assertThat(solution.getScore().hardScore())
        .as("Solution should have no hard constraint violations")
        .isZero();

    // Verify all lessons are assigned
    for (PlanningLesson lesson : solution.getLessons()) {
      assertThat(lesson.getTimeSlot())
          .as("Lesson for %s should have a time slot assigned", lesson.getSchoolClass().getName())
          .isNotNull();
      assertThat(lesson.getRoom())
          .as("Lesson for %s should have a room assigned", lesson.getSchoolClass().getName())
          .isNotNull();
    }
  }

  @Test
  @DisplayName("Solver respects teacher blocked slots")
  void solver_respectsTeacherBlockedSlots() {
    // Create a teacher blocked on Monday period 1
    PlanningTeacher blockedTeacher =
        new PlanningTeacher(
            UUID.randomUUID(),
            "Blocked Teacher",
            "BLK",
            28,
            Set.of("0-1"), // Blocked Monday period 1
            Set.of(),
            Map.of(deutschId, Set.of(1, 2, 3, 4)));

    // Use only this teacher and one class
    List<PlanningTeacher> singleTeacher = List.of(blockedTeacher);
    PlanningSchoolClass class1a = schoolClasses.get(0);

    // Create one lesson that must avoid Monday period 1
    PlanningLesson lesson =
        new PlanningLesson(
            UUID.randomUUID(), class1a, blockedTeacher, subjects.get(0), WeekPattern.EVERY);

    Timetable problem =
        new Timetable(
            termId, timeSlots, rooms, singleTeacher, List.of(class1a), subjects, List.of(lesson));

    Timetable solution = solverFactory.buildSolver().solve(problem);

    // Verify solution respects blocked slot
    assertThat(solution.getScore().hardScore()).isZero();
    PlanningLesson solvedLesson = solution.getLessons().get(0);
    assertThat(solvedLesson.getTimeSlot().getDayPeriodKey())
        .as("Lesson should not be assigned to blocked slot 0-1")
        .isNotEqualTo("0-1");
  }

  @Test
  @DisplayName("Solver respects room capacity constraints")
  void solver_respectsRoomCapacity() {
    // Create a small room and a large class
    PlanningRoom smallRoom = new PlanningRoom(UUID.randomUUID(), "Small Room", 15, Set.of());
    PlanningRoom largeRoom = new PlanningRoom(UUID.randomUUID(), "Large Room", 30, Set.of());

    PlanningSchoolClass largeClass =
        new PlanningSchoolClass(UUID.randomUUID(), "1a", (short) 1, 25, null);

    PlanningTeacher teacher = teachers.get(0);

    PlanningLesson lesson =
        new PlanningLesson(
            UUID.randomUUID(), largeClass, teacher, subjects.get(0), WeekPattern.EVERY);

    Timetable problem =
        new Timetable(
            termId,
            timeSlots,
            List.of(smallRoom, largeRoom),
            List.of(teacher),
            List.of(largeClass),
            subjects,
            List.of(lesson));

    Timetable solution = solverFactory.buildSolver().solve(problem);

    // Verify solution assigns to large room (small room capacity 15 < class size 25)
    assertThat(solution.getScore().hardScore()).isZero();
    PlanningLesson solvedLesson = solution.getLessons().get(0);
    assertThat(solvedLesson.getRoom().getCapacity())
        .as("Lesson should be assigned to a room with sufficient capacity")
        .isGreaterThanOrEqualTo(25);
  }

  @Test
  @DisplayName("Solver respects teacher qualification constraints")
  void solver_respectsTeacherQualifications() {
    // Create two teachers with different qualifications
    PlanningTeacher mathTeacher =
        new PlanningTeacher(
            UUID.randomUUID(),
            "Math Teacher",
            "MT",
            28,
            Set.of(),
            Set.of(),
            Map.of(matheId, Set.of(1, 2, 3, 4))); // Only qualified for math

    PlanningTeacher germanTeacher =
        new PlanningTeacher(
            UUID.randomUUID(),
            "German Teacher",
            "GT",
            28,
            Set.of(),
            Set.of(),
            Map.of(deutschId, Set.of(1, 2, 3, 4))); // Only qualified for German

    PlanningSchoolClass class1a = schoolClasses.get(0);

    // Create lessons that need specific teachers
    // Math lesson should be assigned to mathTeacher, German to germanTeacher
    // But we pre-assign teacher (it's a fixed property), so the solver should not violate this
    PlanningLesson mathLesson =
        new PlanningLesson(
            UUID.randomUUID(),
            class1a,
            mathTeacher,
            subjects.get(1), // Mathe
            WeekPattern.EVERY);

    PlanningLesson germanLesson =
        new PlanningLesson(
            UUID.randomUUID(),
            class1a,
            germanTeacher,
            subjects.get(0), // Deutsch
            WeekPattern.EVERY);

    Timetable problem =
        new Timetable(
            termId,
            timeSlots,
            rooms,
            List.of(mathTeacher, germanTeacher),
            List.of(class1a),
            subjects,
            List.of(mathLesson, germanLesson));

    Timetable solution = solverFactory.buildSolver().solve(problem);

    // Both teachers are qualified for their assigned subjects, so no hard violations
    assertThat(solution.getScore().hardScore()).isZero();
  }

  @Test
  @DisplayName("Solver handles A/B week pattern without conflicts")
  void solver_handlesWeekPatterns() {
    PlanningTeacher teacher = teachers.get(0);
    PlanningSchoolClass class1a = schoolClasses.get(0);
    PlanningSchoolClass class1b = schoolClasses.get(1);

    // Same teacher teaches both classes, but at different week patterns
    // This should NOT create a conflict
    PlanningLesson lessonWeekA =
        new PlanningLesson(
            UUID.randomUUID(), class1a, teacher, subjects.get(0), WeekPattern.A); // A week

    PlanningLesson lessonWeekB =
        new PlanningLesson(
            UUID.randomUUID(), class1b, teacher, subjects.get(0), WeekPattern.B); // B week

    Timetable problem =
        new Timetable(
            termId,
            timeSlots,
            rooms,
            List.of(teacher),
            List.of(class1a, class1b),
            subjects,
            List.of(lessonWeekA, lessonWeekB));

    Timetable solution = solverFactory.buildSolver().solve(problem);

    // Even if both lessons end up in the same timeslot, it's valid because A/B don't overlap
    assertThat(solution.getScore().hardScore()).isZero();
  }

  // ==================== Helper Methods ====================

  private void createTimeSlots() {
    timeSlots = new ArrayList<>();

    // Create 30 time slots: 6 periods per day, Monday-Friday
    for (int day = 0; day < 5; day++) {
      for (int period = 1; period <= 6; period++) {
        timeSlots.add(
            new PlanningTimeSlot(
                UUID.randomUUID(),
                (short) day,
                (short) period,
                LocalTime.of(7 + period, 0),
                LocalTime.of(7 + period, 45),
                false));
      }
    }
  }

  private void createRooms() {
    rooms = new ArrayList<>();
    for (int i = 1; i <= 4; i++) {
      rooms.add(
          new PlanningRoom(UUID.randomUUID(), "Raum 10" + i, 28, Set.of("whiteboard", "beamer")));
    }
  }

  private void createSubjects() {
    subjects =
        List.of(
            new PlanningSubject(deutschId, "Deutsch", "DE"),
            new PlanningSubject(matheId, "Mathematik", "MA"),
            new PlanningSubject(sachunterrichtId, "Sachunterricht", "SU"),
            new PlanningSubject(sportId, "Sport", "SP"),
            new PlanningSubject(kunstId, "Kunst", "KU"),
            new PlanningSubject(musikId, "Musik", "MU"));
  }

  private void createTeachers() {
    teachers = new ArrayList<>();

    // Teacher 1: Can teach Deutsch, Mathe, Sachunterricht for grades 1-4
    teachers.add(
        new PlanningTeacher(
            UUID.randomUUID(),
            "Anna Müller",
            "MÜL",
            28,
            Set.of(),
            Set.of("0-1", "0-2"), // Prefers Monday mornings
            Map.of(
                deutschId, Set.of(1, 2, 3, 4),
                matheId, Set.of(1, 2, 3, 4),
                sachunterrichtId, Set.of(1, 2, 3, 4))));

    // Teacher 2: Can teach Deutsch, Mathe, Sport for grades 1-4
    teachers.add(
        new PlanningTeacher(
            UUID.randomUUID(),
            "Thomas Schmidt",
            "SCH",
            28,
            Set.of(),
            Set.of(),
            Map.of(
                deutschId, Set.of(1, 2, 3, 4),
                matheId, Set.of(1, 2, 3, 4),
                sportId, Set.of(1, 2, 3, 4))));

    // Teacher 3: Can teach Kunst, Musik for grades 1-4
    teachers.add(
        new PlanningTeacher(
            UUID.randomUUID(),
            "Maria Weber",
            "WEB",
            28,
            Set.of(),
            Set.of(),
            Map.of(kunstId, Set.of(1, 2, 3, 4), musikId, Set.of(1, 2, 3, 4))));
  }

  private void createSchoolClasses() {
    schoolClasses = new ArrayList<>();

    // Class 1a with class teacher being teacher 0
    schoolClasses.add(
        new PlanningSchoolClass(UUID.randomUUID(), "1a", (short) 1, 24, teachers.get(0).getId()));

    // Class 1b with class teacher being teacher 1
    schoolClasses.add(
        new PlanningSchoolClass(UUID.randomUUID(), "1b", (short) 1, 23, teachers.get(1).getId()));
  }

  private List<PlanningLesson> createLessonsForSmallSchool() {
    List<PlanningLesson> lessons = new ArrayList<>();

    // Class 1a needs: 2x Deutsch (teacher 0), 2x Mathe (teacher 0)
    PlanningSchoolClass class1a = schoolClasses.get(0);
    PlanningTeacher teacher1 = teachers.get(0);

    lessons.add(
        new PlanningLesson(
            UUID.randomUUID(),
            class1a,
            teacher1,
            subjects.get(0), // Deutsch
            WeekPattern.EVERY));
    lessons.add(
        new PlanningLesson(
            UUID.randomUUID(),
            class1a,
            teacher1,
            subjects.get(0), // Deutsch
            WeekPattern.EVERY));
    lessons.add(
        new PlanningLesson(
            UUID.randomUUID(),
            class1a,
            teacher1,
            subjects.get(1), // Mathe
            WeekPattern.EVERY));
    lessons.add(
        new PlanningLesson(
            UUID.randomUUID(),
            class1a,
            teacher1,
            subjects.get(1), // Mathe
            WeekPattern.EVERY));

    // Class 1b needs: 2x Deutsch (teacher 1), 2x Sport (teacher 1)
    PlanningSchoolClass class1b = schoolClasses.get(1);
    PlanningTeacher teacher2 = teachers.get(1);

    lessons.add(
        new PlanningLesson(
            UUID.randomUUID(),
            class1b,
            teacher2,
            subjects.get(0), // Deutsch
            WeekPattern.EVERY));
    lessons.add(
        new PlanningLesson(
            UUID.randomUUID(),
            class1b,
            teacher2,
            subjects.get(0), // Deutsch
            WeekPattern.EVERY));
    lessons.add(
        new PlanningLesson(
            UUID.randomUUID(),
            class1b,
            teacher2,
            subjects.get(3), // Sport
            WeekPattern.EVERY));
    lessons.add(
        new PlanningLesson(
            UUID.randomUUID(),
            class1b,
            teacher2,
            subjects.get(3), // Sport
            WeekPattern.EVERY));

    return lessons;
  }
}
