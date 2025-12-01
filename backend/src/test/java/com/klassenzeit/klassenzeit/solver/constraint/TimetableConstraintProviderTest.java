package com.klassenzeit.klassenzeit.solver.constraint;

import ai.timefold.solver.test.api.score.stream.ConstraintVerifier;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.solver.domain.PlanningLesson;
import com.klassenzeit.klassenzeit.solver.domain.PlanningRoom;
import com.klassenzeit.klassenzeit.solver.domain.PlanningSchoolClass;
import com.klassenzeit.klassenzeit.solver.domain.PlanningSubject;
import com.klassenzeit.klassenzeit.solver.domain.PlanningTeacher;
import com.klassenzeit.klassenzeit.solver.domain.PlanningTimeSlot;
import com.klassenzeit.klassenzeit.solver.domain.Timetable;
import java.time.LocalTime;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class TimetableConstraintProviderTest {

  private ConstraintVerifier<TimetableConstraintProvider, Timetable> constraintVerifier;

  // Reusable test fixtures
  private PlanningTimeSlot mondayPeriod1;
  private PlanningTimeSlot mondayPeriod2;
  private PlanningTimeSlot mondayPeriod4;
  private PlanningTimeSlot tuesdayPeriod1;
  private PlanningRoom room101;
  private PlanningRoom smallRoom;
  private PlanningSubject math;
  private PlanningSubject german;
  private UUID mathId;
  private UUID germanId;

  @BeforeEach
  void setUp() {
    // Only pass the solution class and planning entity classes (not problem facts)
    constraintVerifier =
        ConstraintVerifier.build(
            new TimetableConstraintProvider(), Timetable.class, PlanningLesson.class);

    // Create reusable timeslots
    mondayPeriod1 = createTimeSlot(0, 1);
    mondayPeriod2 = createTimeSlot(0, 2);
    mondayPeriod4 = createTimeSlot(0, 4);
    tuesdayPeriod1 = createTimeSlot(1, 1);

    // Create reusable rooms
    room101 = new PlanningRoom(UUID.randomUUID(), "Room 101", 30, Set.of());
    smallRoom = new PlanningRoom(UUID.randomUUID(), "Small Room", 15, Set.of());

    // Create reusable subjects
    mathId = UUID.randomUUID();
    math = new PlanningSubject(mathId, "Mathematics", "MA");
    germanId = UUID.randomUUID();
    german = new PlanningSubject(germanId, "German", "DE");
  }

  // ==================== Hard Constraint Tests ====================

  @Nested
  class TeacherConflictTests {

    @Test
    void sameTeacherSameSlot_penalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1b, teacher, german, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherConflict)
          .given(lesson1, lesson2)
          .penalizesBy(1);
    }

    @Test
    void sameTeacherDifferentSlot_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1b, teacher, german, mondayPeriod2, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherConflict)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }

    @Test
    void sameTeacherSameSlot_weekAandB_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lessonWeekA =
          createLessonWithPattern(class1a, teacher, math, mondayPeriod1, room101, WeekPattern.A);
      PlanningLesson lessonWeekB =
          createLessonWithPattern(class1b, teacher, german, mondayPeriod1, room101, WeekPattern.B);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherConflict)
          .given(lessonWeekA, lessonWeekB)
          .penalizesBy(0);
    }

    @Test
    void sameTeacherSameSlot_weekEveryAndA_penalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lessonEvery =
          createLessonWithPattern(
              class1a, teacher, math, mondayPeriod1, room101, WeekPattern.EVERY);
      PlanningLesson lessonWeekA =
          createLessonWithPattern(class1b, teacher, german, mondayPeriod1, room101, WeekPattern.A);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherConflict)
          .given(lessonEvery, lessonWeekA)
          .penalizesBy(1);
    }
  }

  @Nested
  class RoomConflictTests {

    @Test
    void sameRoomSameSlot_penalized() {
      PlanningTeacher teacher1 = createTeacher("Teacher A");
      PlanningTeacher teacher2 = createTeacher("Teacher B");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher1, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1b, teacher2, german, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::roomConflict)
          .given(lesson1, lesson2)
          .penalizesBy(1);
    }

    @Test
    void sameRoomDifferentSlot_notPenalized() {
      PlanningTeacher teacher1 = createTeacher("Teacher A");
      PlanningTeacher teacher2 = createTeacher("Teacher B");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher1, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1b, teacher2, german, mondayPeriod2, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::roomConflict)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }

    @Test
    void nullRoom_notPenalized() {
      PlanningTeacher teacher1 = createTeacher("Teacher A");
      PlanningTeacher teacher2 = createTeacher("Teacher B");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher1, math, mondayPeriod1, null);
      PlanningLesson lesson2 = createLesson(class1b, teacher2, german, mondayPeriod1, null);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::roomConflict)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }
  }

  @Nested
  class SchoolClassConflictTests {

    @Test
    void sameClassSameSlot_penalized() {
      PlanningTeacher teacher1 = createTeacher("Teacher A");
      PlanningTeacher teacher2 = createTeacher("Teacher B");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningRoom room102 = new PlanningRoom(UUID.randomUUID(), "Room 102", 30, Set.of());

      PlanningLesson lesson1 = createLesson(class1a, teacher1, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1a, teacher2, german, mondayPeriod1, room102);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::schoolClassConflict)
          .given(lesson1, lesson2)
          .penalizesBy(1);
    }

    @Test
    void sameClassDifferentSlot_notPenalized() {
      PlanningTeacher teacher1 = createTeacher("Teacher A");
      PlanningTeacher teacher2 = createTeacher("Teacher B");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher1, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1a, teacher2, german, mondayPeriod2, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::schoolClassConflict)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }

    @Test
    void differentClassSameSlot_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1b, teacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::schoolClassConflict)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }
  }

  @Nested
  class TeacherAvailabilityTests {

    @Test
    void teacherBlockedAtSlot_penalized() {
      PlanningTeacher blockedTeacher = createTeacherWithBlocked("Blocked Teacher", Set.of("0-1"));
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, blockedTeacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherAvailability)
          .given(lesson)
          .penalizesBy(1);
    }

    @Test
    void teacherAvailableAtSlot_notPenalized() {
      PlanningTeacher teacher = createTeacher("Available Teacher");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherAvailability)
          .given(lesson)
          .penalizesBy(0);
    }

    @Test
    void teacherBlockedDifferentSlot_notPenalized() {
      PlanningTeacher blockedTeacher = createTeacherWithBlocked("Blocked Teacher", Set.of("0-2"));
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, blockedTeacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherAvailability)
          .given(lesson)
          .penalizesBy(0);
    }
  }

  @Nested
  class RoomCapacityTests {

    @Test
    void roomTooSmall_penalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass largeClass = createSchoolClass("1a", 1, 30, null);

      PlanningLesson lesson = createLesson(largeClass, teacher, math, mondayPeriod1, smallRoom);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::roomCapacity)
          .given(lesson)
          .penalizesBy(1);
    }

    @Test
    void roomFitsClass_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::roomCapacity)
          .given(lesson)
          .penalizesBy(0);
    }

    @Test
    void roomExactlyFits_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 15, null);

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, smallRoom);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::roomCapacity)
          .given(lesson)
          .penalizesBy(0);
    }

    @Test
    void nullRoom_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, null);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::roomCapacity)
          .given(lesson)
          .penalizesBy(0);
    }

    @Test
    void nullCapacity_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningRoom noCapacityRoom = new PlanningRoom(UUID.randomUUID(), "Room", null, Set.of());

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, noCapacityRoom);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::roomCapacity)
          .given(lesson)
          .penalizesBy(0);
    }
  }

  @Nested
  class TeacherQualificationTests {

    @Test
    void notQualified_penalized() {
      PlanningTeacher unqualifiedTeacher =
          createTeacherWithQualifications("Unqualified", Map.of(germanId, Set.of(1, 2)));
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson =
          createLesson(class1a, unqualifiedTeacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherQualification)
          .given(lesson)
          .penalizesBy(1);
    }

    @Test
    void notQualifiedForGrade_penalized() {
      PlanningTeacher teacher =
          createTeacherWithQualifications("Teacher", Map.of(mathId, Set.of(5, 6)));
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherQualification)
          .given(lesson)
          .penalizesBy(1);
    }

    @Test
    void qualified_notPenalized() {
      PlanningTeacher teacher =
          createTeacherWithQualifications("Teacher", Map.of(mathId, Set.of(1, 2, 3, 4)));
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherQualification)
          .given(lesson)
          .penalizesBy(0);
    }
  }

  // ==================== Soft Constraint Tests ====================

  @Nested
  class TeacherPreferredSlotsTests {

    @Test
    void preferredSlot_rewarded() {
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(),
              "Teacher",
              "T",
              28,
              Set.of(),
              Set.of("0-1"),
              Map.of(mathId, Set.of(1, 2, 3, 4)));
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherPreferredSlots)
          .given(lesson)
          .rewardsWith(1);
    }

    @Test
    void notPreferredSlot_noReward() {
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(),
              "Teacher",
              "T",
              28,
              Set.of(),
              Set.of("0-2"),
              Map.of(mathId, Set.of(1, 2, 3, 4)));
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson = createLesson(class1a, teacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::teacherPreferredSlots)
          .given(lesson)
          .rewardsWith(0);
    }
  }

  @Nested
  class MinimizeTeacherGapsTests {

    @Test
    void gapOfTwo_penalizedByOne() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningTimeSlot mondayPeriod3 = createTimeSlot(0, 3);
      PlanningLesson lesson2 = createLesson(class1a, teacher, german, mondayPeriod3, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::minimizeTeacherGaps)
          .given(lesson1, lesson2)
          .penalizesBy(1);
    }

    @Test
    void gapOfThree_penalizedByTwo() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1a, teacher, german, mondayPeriod4, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::minimizeTeacherGaps)
          .given(lesson1, lesson2)
          .penalizesBy(2);
    }

    @Test
    void consecutiveLessons_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1a, teacher, german, mondayPeriod2, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::minimizeTeacherGaps)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }

    @Test
    void differentDays_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1a, teacher, german, tuesdayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::minimizeTeacherGaps)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }

    @Test
    void weekAandB_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 =
          createLessonWithPattern(class1a, teacher, math, mondayPeriod1, room101, WeekPattern.A);
      PlanningLesson lesson2 =
          createLessonWithPattern(class1a, teacher, german, mondayPeriod4, room101, WeekPattern.B);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::minimizeTeacherGaps)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }
  }

  @Nested
  class SubjectDistributionTests {

    @Test
    void sameSubjectSameDay_penalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1a, teacher, math, mondayPeriod2, room101);

      // penalizesBy counts matches, the weight of 2 is applied by the constraint itself
      constraintVerifier
          .verifyThat(TimetableConstraintProvider::subjectDistribution)
          .given(lesson1, lesson2)
          .penalizesBy(1);
    }

    @Test
    void sameSubjectDifferentDay_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1a, teacher, math, tuesdayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::subjectDistribution)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }

    @Test
    void differentSubjectSameDay_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1a, teacher, german, mondayPeriod2, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::subjectDistribution)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }

    @Test
    void sameSubjectSameDayWeekAandB_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson1 =
          createLessonWithPattern(class1a, teacher, math, mondayPeriod1, room101, WeekPattern.A);
      PlanningLesson lesson2 =
          createLessonWithPattern(class1a, teacher, math, mondayPeriod2, room101, WeekPattern.B);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::subjectDistribution)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }

    @Test
    void differentClass_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher A");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);
      PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);

      PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
      PlanningLesson lesson2 = createLesson(class1b, teacher, math, mondayPeriod2, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::subjectDistribution)
          .given(lesson1, lesson2)
          .penalizesBy(0);
    }
  }

  @Nested
  class ClassTeacherFirstPeriodTests {

    @Test
    void firstPeriodNotClassTeacher_penalized() {
      UUID classTeacherId = UUID.randomUUID();
      PlanningTeacher otherTeacher = createTeacher("Other Teacher");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, classTeacherId);

      PlanningLesson lesson = createLesson(class1a, otherTeacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::classTeacherFirstPeriod)
          .given(lesson)
          .penalizesBy(1);
    }

    @Test
    void firstPeriodIsClassTeacher_notPenalized() {
      PlanningTeacher classTeacher = createTeacher("Class Teacher");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, classTeacher.getId());

      PlanningLesson lesson = createLesson(class1a, classTeacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::classTeacherFirstPeriod)
          .given(lesson)
          .penalizesBy(0);
    }

    @Test
    void notFirstPeriod_notPenalized() {
      UUID classTeacherId = UUID.randomUUID();
      PlanningTeacher otherTeacher = createTeacher("Other Teacher");
      PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, classTeacherId);

      PlanningLesson lesson = createLesson(class1a, otherTeacher, math, mondayPeriod2, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::classTeacherFirstPeriod)
          .given(lesson)
          .penalizesBy(0);
    }

    @Test
    void noClassTeacher_notPenalized() {
      PlanningTeacher teacher = createTeacher("Teacher");
      PlanningSchoolClass classWithoutTeacher = createSchoolClass("1a", 1, 25, null);

      PlanningLesson lesson =
          createLesson(classWithoutTeacher, teacher, math, mondayPeriod1, room101);

      constraintVerifier
          .verifyThat(TimetableConstraintProvider::classTeacherFirstPeriod)
          .given(lesson)
          .penalizesBy(0);
    }
  }

  // ==================== Integration Test ====================

  @Test
  void allConstraints_multipleViolations() {
    PlanningTeacher teacher = createTeacher("Teacher A");
    PlanningSchoolClass class1a = createSchoolClass("1a", 1, 25, null);

    // Two lessons for same teacher at same time = teacher conflict (1 hard)
    PlanningLesson lesson1 = createLesson(class1a, teacher, math, mondayPeriod1, room101);
    PlanningSchoolClass class1b = createSchoolClass("1b", 1, 25, null);
    PlanningLesson lesson2 = createLesson(class1b, teacher, german, mondayPeriod1, room101);

    // Verify at least one hard constraint is violated (teacher conflict + room conflict)
    constraintVerifier
        .verifyThat()
        .given(lesson1, lesson2)
        .scores(ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore.of(-2, 0));
  }

  // ==================== Helper Methods ====================

  private PlanningTimeSlot createTimeSlot(int dayOfWeek, int period) {
    return new PlanningTimeSlot(
        UUID.randomUUID(),
        (short) dayOfWeek,
        (short) period,
        LocalTime.of(8 + period - 1, 0),
        LocalTime.of(8 + period - 1, 45),
        false);
  }

  private PlanningTeacher createTeacher(String name) {
    return new PlanningTeacher(
        UUID.randomUUID(),
        name,
        name.substring(0, 2).toUpperCase(),
        28,
        Set.of(),
        Set.of(),
        Map.of(mathId, Set.of(1, 2, 3, 4), germanId, Set.of(1, 2, 3, 4)));
  }

  private PlanningTeacher createTeacherWithBlocked(String name, Set<String> blockedSlots) {
    return new PlanningTeacher(
        UUID.randomUUID(),
        name,
        name.substring(0, 2).toUpperCase(),
        28,
        blockedSlots,
        Set.of(),
        Map.of(mathId, Set.of(1, 2, 3, 4), germanId, Set.of(1, 2, 3, 4)));
  }

  private PlanningTeacher createTeacherWithQualifications(
      String name, Map<UUID, Set<Integer>> qualifications) {
    return new PlanningTeacher(
        UUID.randomUUID(),
        name,
        name.substring(0, 2).toUpperCase(),
        28,
        Set.of(),
        Set.of(),
        qualifications);
  }

  private PlanningSchoolClass createSchoolClass(
      String name, int gradeLevel, int studentCount, UUID classTeacherId) {
    return new PlanningSchoolClass(
        UUID.randomUUID(), name, (short) gradeLevel, studentCount, classTeacherId);
  }

  private PlanningLesson createLesson(
      PlanningSchoolClass schoolClass,
      PlanningTeacher teacher,
      PlanningSubject subject,
      PlanningTimeSlot timeSlot,
      PlanningRoom room) {
    return new PlanningLesson(
        UUID.randomUUID(), schoolClass, teacher, subject, WeekPattern.EVERY, timeSlot, room);
  }

  private PlanningLesson createLessonWithPattern(
      PlanningSchoolClass schoolClass,
      PlanningTeacher teacher,
      PlanningSubject subject,
      PlanningTimeSlot timeSlot,
      PlanningRoom room,
      WeekPattern pattern) {
    return new PlanningLesson(
        UUID.randomUUID(), schoolClass, teacher, subject, pattern, timeSlot, room);
  }
}
