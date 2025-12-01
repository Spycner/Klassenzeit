package com.klassenzeit.klassenzeit.lesson;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.lesson.dto.CreateLessonRequest;
import com.klassenzeit.klassenzeit.lesson.dto.LessonResponse;
import com.klassenzeit.klassenzeit.lesson.dto.LessonSummary;
import com.klassenzeit.klassenzeit.lesson.dto.UpdateLessonRequest;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolYear;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import jakarta.persistence.EntityManager;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class LessonServiceTest extends AbstractIntegrationTest {

  @Autowired private LessonService lessonService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private SchoolYear schoolYear;
  private Term term;
  private SchoolClass schoolClass;
  private Teacher teacher;
  private Subject subject;
  private TimeSlot timeSlot;
  private Room room;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    schoolYear = testData.schoolYear(school).persist();
    term = testData.term(schoolYear).persist();
    schoolClass = testData.schoolClass(school).withName("1a").persist();
    teacher = testData.teacher(school).withFirstName("Max").withLastName("Mustermann").persist();
    subject = testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
    timeSlot =
        testData
            .timeSlot(school)
            .withDayOfWeek((short) 0)
            .withPeriod((short) 1)
            .withTimes(LocalTime.of(8, 0), LocalTime.of(8, 45))
            .persist();
    room = testData.room(school).withName("Room 101").persist();
  }

  @Nested
  class FindAllByTerm {

    @Test
    void returnsAllLessonsForTerm() {
      testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      TimeSlot timeSlot2 =
          testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 2).persist();
      testData.lesson(term, schoolClass, teacher, subject, timeSlot2).persist();
      entityManager.flush();
      entityManager.clear();

      List<LessonSummary> result = lessonService.findAllByTerm(school.getId(), term.getId());

      assertThat(result).hasSize(2);
    }

    @Test
    void doesNotReturnLessonsFromOtherTerm() {
      testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      Term otherTerm = testData.term(schoolYear).withName("2. Halbjahr").persist();
      TimeSlot otherTimeSlot =
          testData.timeSlot(school).withDayOfWeek((short) 1).withPeriod((short) 1).persist();
      testData.lesson(otherTerm, schoolClass, teacher, subject, otherTimeSlot).persist();
      entityManager.flush();
      entityManager.clear();

      List<LessonSummary> result = lessonService.findAllByTerm(school.getId(), term.getId());

      assertThat(result).hasSize(1);
    }

    @Test
    void returnsEmptyListWhenNoLessons() {
      entityManager.flush();
      entityManager.clear();

      List<LessonSummary> result = lessonService.findAllByTerm(school.getId(), term.getId());

      assertThat(result).isEmpty();
    }

    @Test
    void throwsWhenTermBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolYear otherSchoolYear = testData.schoolYear(otherSchool).persist();
      Term otherTerm = testData.term(otherSchoolYear).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> lessonService.findAllByTerm(school.getId(), otherTerm.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Term");
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsLessonWhenFound() {
      Lesson lesson =
          testData
              .lesson(term, schoolClass, teacher, subject, timeSlot)
              .withRoom(room)
              .withWeekPattern(WeekPattern.EVERY)
              .persist();
      entityManager.flush();
      entityManager.clear();

      LessonResponse result = lessonService.findById(school.getId(), term.getId(), lesson.getId());

      assertThat(result.id()).isEqualTo(lesson.getId());
      assertThat(result.schoolClassId()).isEqualTo(schoolClass.getId());
      assertThat(result.schoolClassName()).isEqualTo("1a");
      assertThat(result.teacherId()).isEqualTo(teacher.getId());
      assertThat(result.teacherName()).isEqualTo("Max Mustermann");
      assertThat(result.subjectId()).isEqualTo(subject.getId());
      assertThat(result.subjectName()).isEqualTo("Mathematik");
      assertThat(result.timeslotId()).isEqualTo(timeSlot.getId());
      assertThat(result.dayOfWeek()).isEqualTo((short) 0);
      assertThat(result.period()).isEqualTo((short) 1);
      assertThat(result.startTime()).isEqualTo(LocalTime.of(8, 0));
      assertThat(result.endTime()).isEqualTo(LocalTime.of(8, 45));
      assertThat(result.roomId()).isEqualTo(room.getId());
      assertThat(result.roomName()).isEqualTo("Room 101");
      assertThat(result.weekPattern()).isEqualTo(WeekPattern.EVERY);
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void returnsLessonWithoutRoom() {
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();
      entityManager.flush();
      entityManager.clear();

      LessonResponse result = lessonService.findById(school.getId(), term.getId(), lesson.getId());

      assertThat(result.roomId()).isNull();
      assertThat(result.roomName()).isNull();
    }

    @Test
    void throwsWhenLessonNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> lessonService.findById(school.getId(), term.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Lesson")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenLessonBelongsToDifferentTerm() {
      Term otherTerm = testData.term(schoolYear).withName("2. Halbjahr").persist();
      Lesson lesson = testData.lesson(otherTerm, schoolClass, teacher, subject, timeSlot).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> lessonService.findById(school.getId(), term.getId(), lesson.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsLessonSuccessfully() {
      entityManager.flush();
      entityManager.clear();

      CreateLessonRequest request =
          new CreateLessonRequest(
              schoolClass.getId(),
              teacher.getId(),
              subject.getId(),
              timeSlot.getId(),
              room.getId(),
              WeekPattern.A);

      LessonResponse result = lessonService.create(school.getId(), term.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.schoolClassId()).isEqualTo(schoolClass.getId());
      assertThat(result.teacherId()).isEqualTo(teacher.getId());
      assertThat(result.subjectId()).isEqualTo(subject.getId());
      assertThat(result.timeslotId()).isEqualTo(timeSlot.getId());
      assertThat(result.roomId()).isEqualTo(room.getId());
      assertThat(result.weekPattern()).isEqualTo(WeekPattern.A);
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void createsLessonWithoutRoom() {
      entityManager.flush();
      entityManager.clear();

      CreateLessonRequest request =
          new CreateLessonRequest(
              schoolClass.getId(), teacher.getId(), subject.getId(), timeSlot.getId(), null, null);

      LessonResponse result = lessonService.create(school.getId(), term.getId(), request);

      assertThat(result.roomId()).isNull();
      assertThat(result.weekPattern()).isEqualTo(WeekPattern.EVERY); // default
    }

    @Test
    void throwsWhenTermNotFound() {
      UUID nonExistentTermId = UUID.randomUUID();
      CreateLessonRequest request =
          new CreateLessonRequest(
              schoolClass.getId(), teacher.getId(), subject.getId(), timeSlot.getId(), null, null);

      assertThatThrownBy(() -> lessonService.create(school.getId(), nonExistentTermId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Term");
    }

    @Test
    void throwsWhenSchoolClassNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      CreateLessonRequest request =
          new CreateLessonRequest(
              nonExistentId, teacher.getId(), subject.getId(), timeSlot.getId(), null, null);

      assertThatThrownBy(() -> lessonService.create(school.getId(), term.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("SchoolClass");
    }

    @Test
    void throwsWhenTeacherNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      CreateLessonRequest request =
          new CreateLessonRequest(
              schoolClass.getId(), nonExistentId, subject.getId(), timeSlot.getId(), null, null);

      assertThatThrownBy(() -> lessonService.create(school.getId(), term.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }

    @Test
    void throwsWhenSubjectNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      CreateLessonRequest request =
          new CreateLessonRequest(
              schoolClass.getId(), teacher.getId(), nonExistentId, timeSlot.getId(), null, null);

      assertThatThrownBy(() -> lessonService.create(school.getId(), term.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Subject");
    }

    @Test
    void throwsWhenTimeSlotNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      CreateLessonRequest request =
          new CreateLessonRequest(
              schoolClass.getId(), teacher.getId(), subject.getId(), nonExistentId, null, null);

      assertThatThrownBy(() -> lessonService.create(school.getId(), term.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("TimeSlot");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      SchoolClass newClass = testData.schoolClass(school).withName("2a").persist();
      Teacher newTeacher =
          testData.teacher(school).withFirstName("Anna").withLastName("Schmidt").persist();
      Subject newSubject =
          testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();
      TimeSlot newTimeSlot =
          testData.timeSlot(school).withDayOfWeek((short) 1).withPeriod((short) 2).persist();
      Room newRoom = testData.room(school).withName("Room 202").persist();
      entityManager.flush();
      entityManager.clear();

      UpdateLessonRequest request =
          new UpdateLessonRequest(
              newClass.getId(),
              newTeacher.getId(),
              newSubject.getId(),
              newTimeSlot.getId(),
              newRoom.getId(),
              WeekPattern.B);

      LessonResponse result =
          lessonService.update(school.getId(), term.getId(), lesson.getId(), request);

      assertThat(result.schoolClassId()).isEqualTo(newClass.getId());
      assertThat(result.teacherId()).isEqualTo(newTeacher.getId());
      assertThat(result.subjectId()).isEqualTo(newSubject.getId());
      assertThat(result.timeslotId()).isEqualTo(newTimeSlot.getId());
      assertThat(result.roomId()).isEqualTo(newRoom.getId());
      assertThat(result.weekPattern()).isEqualTo(WeekPattern.B);
    }

    @Test
    void updatesOnlyProvidedFields() {
      Lesson lesson =
          testData
              .lesson(term, schoolClass, teacher, subject, timeSlot)
              .withRoom(room)
              .withWeekPattern(WeekPattern.EVERY)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateLessonRequest request =
          new UpdateLessonRequest(null, null, null, null, null, WeekPattern.A);

      LessonResponse result =
          lessonService.update(school.getId(), term.getId(), lesson.getId(), request);

      assertThat(result.schoolClassId()).isEqualTo(schoolClass.getId()); // unchanged
      assertThat(result.teacherId()).isEqualTo(teacher.getId()); // unchanged
      assertThat(result.subjectId()).isEqualTo(subject.getId()); // unchanged
      assertThat(result.timeslotId()).isEqualTo(timeSlot.getId()); // unchanged
      assertThat(result.roomId()).isEqualTo(room.getId()); // unchanged
      assertThat(result.weekPattern()).isEqualTo(WeekPattern.A); // changed
    }

    @Test
    void throwsWhenLessonNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateLessonRequest request =
          new UpdateLessonRequest(null, null, null, null, null, WeekPattern.A);

      assertThatThrownBy(
              () -> lessonService.update(school.getId(), term.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesLesson() {
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();
      UUID lessonId = lesson.getId();
      entityManager.flush();
      entityManager.clear();

      lessonService.delete(school.getId(), term.getId(), lessonId);

      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> lessonService.findById(school.getId(), term.getId(), lessonId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenLessonNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> lessonService.delete(school.getId(), term.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenLessonBelongsToDifferentTerm() {
      Term otherTerm = testData.term(schoolYear).withName("2. Halbjahr").persist();
      Lesson lesson = testData.lesson(otherTerm, schoolClass, teacher, subject, timeSlot).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> lessonService.delete(school.getId(), term.getId(), lesson.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
