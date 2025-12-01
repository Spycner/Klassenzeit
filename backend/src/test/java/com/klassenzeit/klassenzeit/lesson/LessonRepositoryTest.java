package com.klassenzeit.klassenzeit.lesson;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolYear;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class LessonRepositoryTest extends AbstractIntegrationTest {

  @Autowired private LessonRepository lessonRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private Term term;
  private Teacher teacher;
  private Subject subject;
  private Room room;
  private SchoolClass schoolClass;
  private TimeSlot timeSlot1;
  private TimeSlot timeSlot2;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    SchoolYear schoolYear = testData.schoolYear(school).persist();
    term = testData.term(schoolYear).persist();
    teacher = testData.teacher(school).withAbbreviation("MUE").persist();
    subject = testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
    room = testData.room(school).withName("Room 101").persist();
    schoolClass = testData.schoolClass(school).withName("3a").persist();
    timeSlot1 = testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
    timeSlot2 = testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 2).persist();
  }

  @Test
  void findByTermId_existingTerm_returnsLessons() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).persist();

    SchoolYear otherYear = testData.schoolYear(school).withName("2023/2024").persist();
    Term otherTerm = testData.term(otherYear).persist();
    testData.lesson(otherTerm, schoolClass, teacher, subject, timeSlot1).persist();

    entityManager.flush();
    entityManager.clear();

    List<Lesson> found = lessonRepository.findByTermId(term.getId());

    assertThat(found).hasSize(2);
  }

  @Test
  void findByTermIdAndSchoolClassId_specificClass_returnsClassLessons() {
    SchoolClass otherClass = testData.schoolClass(school).withName("3b").persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    testData.lesson(term, otherClass, teacher, subject, timeSlot2).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndSchoolClassId(term.getId(), schoolClass.getId());

    assertThat(found).hasSize(1);
  }

  @Test
  void findByTermIdAndTeacherId_specificTeacher_returnsTeacherLessons() {
    Teacher otherTeacher = testData.teacher(school).withAbbreviation("SCH").persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    testData.lesson(term, schoolClass, otherTeacher, subject, timeSlot2).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found = lessonRepository.findByTermIdAndTeacherId(term.getId(), teacher.getId());

    assertThat(found).hasSize(1);
  }

  @Test
  void findByTermIdAndSubjectId_specificSubject_returnsSubjectLessons() {
    Subject otherSubject =
        testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    testData.lesson(term, schoolClass, teacher, otherSubject, timeSlot2).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found = lessonRepository.findByTermIdAndSubjectId(term.getId(), subject.getId());

    assertThat(found).hasSize(1);
  }

  @Test
  void findByTermIdAndRoomId_specificRoom_returnsRoomLessons() {
    Room otherRoom = testData.room(school).withName("Room 102").persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).withRoom(room).persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).withRoom(otherRoom).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found = lessonRepository.findByTermIdAndRoomId(term.getId(), room.getId());

    assertThat(found).hasSize(1);
  }

  @Test
  void findByTermIdAndTimeslotId_specificSlot_returnsSlotLessons() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndTimeslotId(term.getId(), timeSlot1.getId());

    assertThat(found).hasSize(1);
  }

  @Test
  void findByTermIdAndWeekPattern_everyWeek_returnsEveryWeekLessons() {
    testData
        .lesson(term, schoolClass, teacher, subject, timeSlot1)
        .withWeekPattern(WeekPattern.EVERY)
        .persist();
    testData
        .lesson(term, schoolClass, teacher, subject, timeSlot2)
        .withWeekPattern(WeekPattern.A)
        .persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndWeekPattern(term.getId(), WeekPattern.EVERY);

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getWeekPattern()).isEqualTo(WeekPattern.EVERY);
  }

  @Test
  void findByTermIdAndTeacherIdAndTimeslotId_conflict_returnsPotentialConflict() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndTeacherIdAndTimeslotId(
            term.getId(), teacher.getId(), timeSlot1.getId());

    assertThat(found).hasSize(1);
  }

  @Test
  void findByTermIdAndRoomIdAndTimeslotId_conflict_returnsPotentialConflict() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).withRoom(room).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndRoomIdAndTimeslotId(
            term.getId(), room.getId(), timeSlot1.getId());

    assertThat(found).hasSize(1);
  }

  @Test
  void findByTermIdAndSchoolClassIdAndTimeslotId_conflict_returnsPotentialConflict() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndSchoolClassIdAndTimeslotId(
            term.getId(), schoolClass.getId(), timeSlot1.getId());

    assertThat(found).hasSize(1);
  }

  @Test
  void
      findByTermIdAndSchoolClassIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc_schedule_returnsSorted() {
    TimeSlot tuesdayPeriod1 =
        testData.timeSlot(school).withDayOfWeek((short) 1).withPeriod((short) 1).persist();

    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).persist(); // Monday period 2
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist(); // Monday period 1
    testData.lesson(term, schoolClass, teacher, subject, tuesdayPeriod1).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndSchoolClassIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc(
            term.getId(), schoolClass.getId());

    assertThat(found).hasSize(3);
    assertThat(found.get(0).getTimeslot().getDayOfWeek()).isEqualTo((short) 0);
    assertThat(found.get(0).getTimeslot().getPeriod()).isEqualTo((short) 1);
    assertThat(found.get(1).getTimeslot().getDayOfWeek()).isEqualTo((short) 0);
    assertThat(found.get(1).getTimeslot().getPeriod()).isEqualTo((short) 2);
    assertThat(found.get(2).getTimeslot().getDayOfWeek()).isEqualTo((short) 1);
  }

  @Test
  void
      findByTermIdAndTeacherIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc_schedule_returnsSorted() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndTeacherIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc(
            term.getId(), teacher.getId());

    assertThat(found).hasSize(2);
    assertThat(found.get(0).getTimeslot().getPeriod()).isEqualTo((short) 1);
    assertThat(found.get(1).getTimeslot().getPeriod()).isEqualTo((short) 2);
  }

  @Test
  void findByTermIdAndRoomIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc_schedule_returnsSorted() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).withRoom(room).persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).withRoom(room).persist();
    entityManager.flush();
    entityManager.clear();

    List<Lesson> found =
        lessonRepository.findByTermIdAndRoomIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc(
            term.getId(), room.getId());

    assertThat(found).hasSize(2);
    assertThat(found.get(0).getTimeslot().getPeriod()).isEqualTo((short) 1);
    assertThat(found.get(1).getTimeslot().getPeriod()).isEqualTo((short) 2);
  }

  @Test
  void countByTermIdAndTeacherId_teacherLessons_returnsCount() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).persist();

    Teacher otherTeacher = testData.teacher(school).withAbbreviation("SCH").persist();
    TimeSlot timeSlot3 =
        testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 3).persist();
    testData.lesson(term, schoolClass, otherTeacher, subject, timeSlot3).persist();
    entityManager.flush();

    long count = lessonRepository.countByTermIdAndTeacherId(term.getId(), teacher.getId());

    assertThat(count).isEqualTo(2);
  }

  @Test
  void countByTermIdAndSchoolClassId_classLessons_returnsCount() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).persist();

    SchoolClass otherClass = testData.schoolClass(school).withName("3b").persist();
    TimeSlot timeSlot3 =
        testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 3).persist();
    testData.lesson(term, otherClass, teacher, subject, timeSlot3).persist();
    entityManager.flush();

    long count = lessonRepository.countByTermIdAndSchoolClassId(term.getId(), schoolClass.getId());

    assertThat(count).isEqualTo(2);
  }

  @Test
  void deleteByTermId_existingLessons_deletesAll() {
    testData.lesson(term, schoolClass, teacher, subject, timeSlot1).persist();
    testData.lesson(term, schoolClass, teacher, subject, timeSlot2).persist();

    SchoolYear otherYear = testData.schoolYear(school).withName("2023/2024").persist();
    Term otherTerm = testData.term(otherYear).persist();
    testData.lesson(otherTerm, schoolClass, teacher, subject, timeSlot1).persist();
    entityManager.flush();
    entityManager.clear();

    lessonRepository.deleteByTermId(term.getId());
    entityManager.flush();
    entityManager.clear();

    List<Lesson> remainingInTerm = lessonRepository.findByTermId(term.getId());
    assertThat(remainingInTerm).isEmpty();

    List<Lesson> remainingInOtherTerm = lessonRepository.findByTermId(otherTerm.getId());
    assertThat(remainingInOtherTerm).hasSize(1);
  }
}
