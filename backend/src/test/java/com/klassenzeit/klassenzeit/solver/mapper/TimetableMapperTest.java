package com.klassenzeit.klassenzeit.solver.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.AvailabilityType;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.lesson.Lesson;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolYear;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.solver.domain.PlanningLesson;
import com.klassenzeit.klassenzeit.solver.domain.PlanningRoom;
import com.klassenzeit.klassenzeit.solver.domain.PlanningSchoolClass;
import com.klassenzeit.klassenzeit.solver.domain.PlanningSubject;
import com.klassenzeit.klassenzeit.solver.domain.PlanningTeacher;
import com.klassenzeit.klassenzeit.solver.domain.PlanningTimeSlot;
import com.klassenzeit.klassenzeit.solver.domain.Timetable;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import jakarta.persistence.EntityManager;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TimetableMapperTest extends AbstractIntegrationTest {

  @Autowired private TimetableMapper mapper;

  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private SchoolYear schoolYear;
  private Term term;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    schoolYear = testData.schoolYear(school).persist();
    term = testData.term(schoolYear).persist();
  }

  @Nested
  class ToTimetableTests {

    @Test
    void toTimetable_convertsAllEntities() {
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      Room room = testData.room(school).persist();
      Subject subject = testData.subject(school).persist();
      Teacher teacher = testData.teacher(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      testData.qualification(teacher, subject).persist();

      Lesson lesson =
          testData.lesson(term, schoolClass, teacher, subject, timeSlot).withRoom(room).persist();

      entityManager.flush();
      entityManager.clear();

      Timetable result =
          mapper.toTimetable(
              term,
              List.of(timeSlot),
              List.of(room),
              List.of(teacher),
              List.of(schoolClass),
              List.of(subject),
              List.of(lesson));

      assertThat(result.getTermId()).isEqualTo(term.getId());
      assertThat(result.getTimeSlots()).hasSize(1);
      assertThat(result.getRooms()).hasSize(1);
      assertThat(result.getTeachers()).hasSize(1);
      assertThat(result.getSchoolClasses()).hasSize(1);
      assertThat(result.getSubjects()).hasSize(1);
      assertThat(result.getLessons()).hasSize(1);
    }

    @Test
    void toTimetable_filtersOutBreakTimeSlots() {
      TimeSlot regular = testData.timeSlot(school).withPeriod((short) 1).persist();
      TimeSlot breakSlot = testData.timeSlot(school).withPeriod((short) 2).isBreak(true).persist();

      entityManager.flush();

      Timetable result =
          mapper.toTimetable(
              term,
              List.of(regular, breakSlot),
              List.of(),
              List.of(),
              List.of(),
              List.of(),
              List.of());

      assertThat(result.getTimeSlots()).hasSize(1);
      assertThat(result.getTimeSlots().get(0).isBreak()).isFalse();
    }

    @Test
    void toTimetable_filtersOutInactiveRooms() {
      Room active = testData.room(school).withName("Active").isActive(true).persist();
      Room inactive = testData.room(school).withName("Inactive").isActive(false).persist();

      entityManager.flush();

      Timetable result =
          mapper.toTimetable(
              term,
              List.of(),
              List.of(active, inactive),
              List.of(),
              List.of(),
              List.of(),
              List.of());

      assertThat(result.getRooms()).hasSize(1);
      assertThat(result.getRooms().get(0).getName()).isEqualTo("Active");
    }

    @Test
    void toTimetable_filtersOutInactiveTeachers() {
      Teacher active = testData.teacher(school).withAbbreviation("ACT").isActive(true).persist();
      Teacher inactive = testData.teacher(school).withAbbreviation("INA").isActive(false).persist();

      entityManager.flush();

      Timetable result =
          mapper.toTimetable(
              term,
              List.of(),
              List.of(),
              List.of(active, inactive),
              List.of(),
              List.of(),
              List.of());

      assertThat(result.getTeachers()).hasSize(1);
      assertThat(result.getTeachers().get(0).getAbbreviation()).isEqualTo("ACT");
    }

    @Test
    void toTimetable_filtersOutInactiveSchoolClasses() {
      SchoolClass active = testData.schoolClass(school).withName("Active").isActive(true).persist();
      SchoolClass inactive =
          testData.schoolClass(school).withName("Inactive").isActive(false).persist();

      entityManager.flush();

      Timetable result =
          mapper.toTimetable(
              term,
              List.of(),
              List.of(),
              List.of(),
              List.of(active, inactive),
              List.of(),
              List.of());

      assertThat(result.getSchoolClasses()).hasSize(1);
      assertThat(result.getSchoolClasses().get(0).getName()).isEqualTo("Active");
    }
  }

  @Nested
  class ToPlanningTeacherTests {

    @Test
    void toPlanningTeacher_convertsBlockedSlots() {
      Teacher teacher = testData.teacher(school).persist();
      testData
          .availability(teacher)
          .global()
          .withDayOfWeek((short) 0)
          .withPeriod((short) 1)
          .withType(AvailabilityType.BLOCKED)
          .persist();

      entityManager.flush();
      entityManager.clear();

      Teacher fetched = entityManager.find(Teacher.class, teacher.getId());
      PlanningTeacher result = mapper.toPlanningTeacher(fetched, term.getId());

      assertThat(result.getBlockedSlots()).contains("0-1");
    }

    @Test
    void toPlanningTeacher_convertsPreferredSlots() {
      Teacher teacher = testData.teacher(school).persist();
      testData
          .availability(teacher)
          .global()
          .withDayOfWeek((short) 1)
          .withPeriod((short) 2)
          .withType(AvailabilityType.PREFERRED)
          .persist();

      entityManager.flush();
      entityManager.clear();

      Teacher fetched = entityManager.find(Teacher.class, teacher.getId());
      PlanningTeacher result = mapper.toPlanningTeacher(fetched, term.getId());

      assertThat(result.getPreferredSlots()).contains("1-2");
    }

    @Test
    void toPlanningTeacher_convertsQualifications() {
      Teacher teacher = testData.teacher(school).persist();
      Subject math = testData.subject(school).withName("Math").persist();
      testData.qualification(teacher, math).withGrades(List.of(1, 2, 3)).persist();

      entityManager.flush();
      entityManager.clear();

      Teacher fetched = entityManager.find(Teacher.class, teacher.getId());
      PlanningTeacher result = mapper.toPlanningTeacher(fetched, term.getId());

      assertThat(result.isQualifiedFor(math.getId(), (short) 2)).isTrue();
      assertThat(result.isQualifiedFor(math.getId(), (short) 4)).isFalse();
    }

    @Test
    void toPlanningTeacher_includesGlobalAndTermSpecificAvailability() {
      Teacher teacher = testData.teacher(school).persist();

      // Global availability
      testData
          .availability(teacher)
          .global()
          .withDayOfWeek((short) 0)
          .withPeriod((short) 1)
          .withType(AvailabilityType.BLOCKED)
          .persist();

      // Term-specific availability
      testData
          .availability(teacher)
          .withTerm(term)
          .withDayOfWeek((short) 1)
          .withPeriod((short) 2)
          .withType(AvailabilityType.BLOCKED)
          .persist();

      // Different term availability (should be excluded)
      Term otherTerm = testData.term(schoolYear).withName("Other Term").persist();
      testData
          .availability(teacher)
          .withTerm(otherTerm)
          .withDayOfWeek((short) 2)
          .withPeriod((short) 3)
          .withType(AvailabilityType.BLOCKED)
          .persist();

      entityManager.flush();
      entityManager.clear();

      Teacher fetched = entityManager.find(Teacher.class, teacher.getId());
      PlanningTeacher result = mapper.toPlanningTeacher(fetched, term.getId());

      assertThat(result.getBlockedSlots()).containsExactlyInAnyOrder("0-1", "1-2");
      assertThat(result.getBlockedSlots()).doesNotContain("2-3");
    }
  }

  @Nested
  class ToPlanningRoomTests {

    @Test
    void toPlanningRoom_parsesFeaturesFromJson() {
      Room room =
          testData
              .room(school)
              .withFeatures("[\"computer\", \"projector\", \"whiteboard\"]")
              .persist();

      entityManager.flush();

      PlanningRoom result = mapper.toPlanningRoom(room);

      assertThat(result.getFeatures())
          .containsExactlyInAnyOrder("computer", "projector", "whiteboard");
    }

    @Test
    void toPlanningRoom_handlesEmptyFeatures() {
      Room room = testData.room(school).withFeatures("[]").persist();

      entityManager.flush();

      PlanningRoom result = mapper.toPlanningRoom(room);

      assertThat(result.getFeatures()).isEmpty();
    }

    @Test
    void toPlanningRoom_handlesNullFeatures() {
      // Use build() instead of persist() since features column has NOT NULL constraint
      Room room = testData.room(school).withFeatures(null).build();

      PlanningRoom result = mapper.toPlanningRoom(room);

      assertThat(result.getFeatures()).isEmpty();
    }
  }

  @Nested
  class ToPlanningSchoolClassTests {

    @Test
    void toPlanningSchoolClass_includesClassTeacherId() {
      Teacher classTeacher = testData.teacher(school).persist();
      SchoolClass schoolClass =
          testData.schoolClass(school).withClassTeacher(classTeacher).persist();

      entityManager.flush();

      PlanningSchoolClass result = mapper.toPlanningSchoolClass(schoolClass);

      assertThat(result.getClassTeacherId()).isEqualTo(classTeacher.getId());
    }

    @Test
    void toPlanningSchoolClass_handlesNullClassTeacher() {
      SchoolClass schoolClass = testData.schoolClass(school).persist();

      entityManager.flush();

      PlanningSchoolClass result = mapper.toPlanningSchoolClass(schoolClass);

      assertThat(result.getClassTeacherId()).isNull();
    }
  }

  @Nested
  class ExtractAssignmentsTests {

    @Test
    void extractAssignments_extractsFromSolvedTimetable() {
      UUID lessonId = UUID.randomUUID();
      UUID slotId = UUID.randomUUID();
      UUID roomId = UUID.randomUUID();

      PlanningTimeSlot slot =
          new PlanningTimeSlot(
              slotId, (short) 0, (short) 1, LocalTime.of(8, 0), LocalTime.of(8, 45), false);
      PlanningRoom room = new PlanningRoom(roomId, "Room 1", 30, Set.of());
      PlanningLesson lesson =
          new PlanningLesson(
              lessonId,
              new PlanningSchoolClass(UUID.randomUUID(), "1a", (short) 1, 25, null),
              new PlanningTeacher(UUID.randomUUID(), "T", "T", 28, Set.of(), Set.of(), Map.of()),
              new PlanningSubject(UUID.randomUUID(), "Math", "MA"),
              WeekPattern.EVERY,
              slot,
              room);

      Timetable timetable =
          new Timetable(
              UUID.randomUUID(),
              List.of(slot),
              List.of(room),
              List.of(),
              List.of(),
              List.of(),
              List.of(lesson));

      Map<UUID, TimetableMapper.LessonAssignment> assignments =
          mapper.extractAssignments(timetable);

      assertThat(assignments).hasSize(1);
      TimetableMapper.LessonAssignment assignment = assignments.get(lessonId);
      assertThat(assignment.timeSlotId()).isEqualTo(slotId);
      assertThat(assignment.roomId()).isEqualTo(roomId);
    }

    @Test
    void extractAssignments_handlesUnassignedLessons() {
      UUID lessonId = UUID.randomUUID();

      PlanningLesson lesson =
          new PlanningLesson(
              lessonId,
              new PlanningSchoolClass(UUID.randomUUID(), "1a", (short) 1, 25, null),
              new PlanningTeacher(UUID.randomUUID(), "T", "T", 28, Set.of(), Set.of(), Map.of()),
              new PlanningSubject(UUID.randomUUID(), "Math", "MA"),
              WeekPattern.EVERY);

      Timetable timetable =
          new Timetable(
              UUID.randomUUID(),
              List.of(),
              List.of(),
              List.of(),
              List.of(),
              List.of(),
              List.of(lesson));

      Map<UUID, TimetableMapper.LessonAssignment> assignments =
          mapper.extractAssignments(timetable);

      assertThat(assignments).hasSize(1);
      TimetableMapper.LessonAssignment assignment = assignments.get(lessonId);
      assertThat(assignment.timeSlotId()).isNull();
      assertThat(assignment.roomId()).isNull();
    }
  }

  @Nested
  class ToPlanningLessonTests {

    @Test
    void toPlanningLesson_preservesExistingAssignments() {
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      Room room = testData.room(school).persist();
      Subject subject = testData.subject(school).persist();
      Teacher teacher = testData.teacher(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();

      Lesson lesson =
          testData.lesson(term, schoolClass, teacher, subject, timeSlot).withRoom(room).persist();

      entityManager.flush();
      entityManager.clear();

      Timetable result =
          mapper.toTimetable(
              term,
              List.of(timeSlot),
              List.of(room),
              List.of(teacher),
              List.of(schoolClass),
              List.of(subject),
              List.of(lesson));

      PlanningLesson planningLesson = result.getLessons().get(0);
      assertThat(planningLesson.getTimeSlot()).isNotNull();
      assertThat(planningLesson.getTimeSlot().getId()).isEqualTo(timeSlot.getId());
      assertThat(planningLesson.getRoom()).isNotNull();
      assertThat(planningLesson.getRoom().getId()).isEqualTo(room.getId());
    }

    @Test
    void toPlanningLesson_handlesNullRoomAssignment() {
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      Subject subject = testData.subject(school).persist();
      Teacher teacher = testData.teacher(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();

      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      entityManager.flush();
      entityManager.clear();

      Timetable result =
          mapper.toTimetable(
              term,
              List.of(timeSlot),
              List.of(),
              List.of(teacher),
              List.of(schoolClass),
              List.of(subject),
              List.of(lesson));

      PlanningLesson planningLesson = result.getLessons().get(0);
      assertThat(planningLesson.getRoom()).isNull();
    }

    @Test
    void toPlanningLesson_preservesWeekPattern() {
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      Subject subject = testData.subject(school).persist();
      Teacher teacher = testData.teacher(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();

      Lesson lesson =
          testData
              .lesson(term, schoolClass, teacher, subject, timeSlot)
              .withWeekPattern(WeekPattern.A)
              .persist();

      entityManager.flush();
      entityManager.clear();

      Timetable result =
          mapper.toTimetable(
              term,
              List.of(timeSlot),
              List.of(),
              List.of(teacher),
              List.of(schoolClass),
              List.of(subject),
              List.of(lesson));

      PlanningLesson planningLesson = result.getLessons().get(0);
      assertThat(planningLesson.getWeekPattern()).isEqualTo(WeekPattern.A);
    }
  }
}
