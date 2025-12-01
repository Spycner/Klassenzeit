package com.klassenzeit.klassenzeit;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.lesson.Lesson;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolYear;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.teacher.TeacherAvailability;
import com.klassenzeit.klassenzeit.teacher.TeacherSubjectQualification;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests verifying cascading delete behavior.
 *
 * <p>These tests verify that when parent entities are deleted, all related child entities are
 * properly cascaded (deleted) and no orphan records are left behind.
 */
@Transactional
class CascadingDeleteIntegrationTest extends AbstractIntegrationTest {

  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
  }

  @Nested
  class SchoolDeletion {

    @Test
    void deletingSchool_cascadesToAllRelatedEntities() {
      // Given: A school with full entity hierarchy
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      Room room = testData.room(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      testData.qualification(teacher, subject).persist();
      testData.availability(teacher).withTerm(term).persist();
      testData.lesson(term, schoolClass, teacher, subject, timeSlot).withRoom(room).persist();

      UUID schoolId = school.getId();
      UUID schoolYearId = schoolYear.getId();
      UUID termId = term.getId();
      UUID teacherId = teacher.getId();
      UUID subjectId = subject.getId();
      UUID roomId = room.getId();
      UUID schoolClassId = schoolClass.getId();
      UUID timeSlotId = timeSlot.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the school
      School schoolToDelete = entityManager.find(School.class, schoolId);
      entityManager.remove(schoolToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: All related entities should be deleted
      assertThat(entityManager.find(School.class, schoolId)).isNull();
      assertThat(entityManager.find(SchoolYear.class, schoolYearId)).isNull();
      assertThat(entityManager.find(Term.class, termId)).isNull();
      assertThat(entityManager.find(Teacher.class, teacherId)).isNull();
      assertThat(entityManager.find(Subject.class, subjectId)).isNull();
      assertThat(entityManager.find(Room.class, roomId)).isNull();
      assertThat(entityManager.find(SchoolClass.class, schoolClassId)).isNull();
      assertThat(entityManager.find(TimeSlot.class, timeSlotId)).isNull();

      // Verify no orphan records exist via count queries
      assertThat(
              entityManager
                  .createQuery(
                      "SELECT COUNT(tsq) FROM TeacherSubjectQualification tsq "
                          + "WHERE tsq.teacher.id = :teacherId",
                      Long.class)
                  .setParameter("teacherId", teacherId)
                  .getSingleResult())
          .isZero();

      assertThat(
              entityManager
                  .createQuery(
                      "SELECT COUNT(ta) FROM TeacherAvailability ta WHERE ta.teacher.id = :teacherId",
                      Long.class)
                  .setParameter("teacherId", teacherId)
                  .getSingleResult())
          .isZero();

      assertThat(
              entityManager
                  .createQuery(
                      "SELECT COUNT(l) FROM Lesson l WHERE l.term.id = :termId", Long.class)
                  .setParameter("termId", termId)
                  .getSingleResult())
          .isZero();
    }

    @Test
    @SuppressWarnings("PMD.UnusedLocalVariable")
    void deletingSchool_doesNotAffectOtherSchools() {
      // Given: Two schools with their own data
      School school1 = testData.school().withSlug("school-1").persist();
      // Create teacher1 to ensure cascade deletes work but we don't verify it
      testData.teacher(school1).withAbbreviation("T1").persist();

      School school2 = testData.school().withSlug("school-2").persist();
      Teacher teacher2 = testData.teacher(school2).withAbbreviation("T2").persist();

      UUID school1Id = school1.getId();
      UUID school2Id = school2.getId();
      UUID teacher2Id = teacher2.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete school1
      School schoolToDelete = entityManager.find(School.class, school1Id);
      entityManager.remove(schoolToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: School2 and its data should still exist
      assertThat(entityManager.find(School.class, school2Id)).isNotNull();
      assertThat(entityManager.find(Teacher.class, teacher2Id)).isNotNull();
    }
  }

  @Nested
  class TeacherDeletion {

    @Test
    void deletingTeacher_cascadesToQualificationsAndAvailabilities() {
      // Given: A teacher with qualifications and availabilities
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      TeacherSubjectQualification qualification =
          testData.qualification(teacher, subject).persist();
      TeacherAvailability availability = testData.availability(teacher).withTerm(term).persist();

      UUID teacherId = teacher.getId();
      UUID qualificationId = qualification.getId();
      UUID availabilityId = availability.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the teacher
      Teacher teacherToDelete = entityManager.find(Teacher.class, teacherId);
      entityManager.remove(teacherToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: Qualifications and availabilities should be deleted
      assertThat(entityManager.find(Teacher.class, teacherId)).isNull();
      assertThat(entityManager.find(TeacherSubjectQualification.class, qualificationId)).isNull();
      assertThat(entityManager.find(TeacherAvailability.class, availabilityId)).isNull();
    }

    @Test
    void deletingTeacher_cascadesToLessons() {
      // Given: A teacher with lessons
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      UUID teacherId = teacher.getId();
      UUID lessonId = lesson.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the teacher
      Teacher teacherToDelete = entityManager.find(Teacher.class, teacherId);
      entityManager.remove(teacherToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: Lessons should be deleted
      assertThat(entityManager.find(Teacher.class, teacherId)).isNull();
      assertThat(entityManager.find(Lesson.class, lessonId)).isNull();
    }

    @Test
    void deletingTeacher_setsSchoolClassTeacherToNull() {
      // Given: A teacher who is a class teacher
      School school = testData.school().persist();
      Teacher teacher = testData.teacher(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).withClassTeacher(teacher).persist();

      UUID teacherId = teacher.getId();
      UUID schoolClassId = schoolClass.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the teacher
      Teacher teacherToDelete = entityManager.find(Teacher.class, teacherId);
      entityManager.remove(teacherToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: SchoolClass should still exist but classTeacher should be null
      SchoolClass reloadedSchoolClass = entityManager.find(SchoolClass.class, schoolClassId);
      assertThat(reloadedSchoolClass).isNotNull();
      assertThat(reloadedSchoolClass.getClassTeacher()).isNull();
    }
  }

  @Nested
  class SubjectDeletion {

    @Test
    void deletingSubject_cascadesToQualificationsAndLessons() {
      // Given: A subject with qualifications and lessons
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      TeacherSubjectQualification qualification =
          testData.qualification(teacher, subject).persist();
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      UUID subjectId = subject.getId();
      UUID qualificationId = qualification.getId();
      UUID lessonId = lesson.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the subject
      Subject subjectToDelete = entityManager.find(Subject.class, subjectId);
      entityManager.remove(subjectToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: Qualifications and lessons should be deleted
      assertThat(entityManager.find(Subject.class, subjectId)).isNull();
      assertThat(entityManager.find(TeacherSubjectQualification.class, qualificationId)).isNull();
      assertThat(entityManager.find(Lesson.class, lessonId)).isNull();
    }
  }

  @Nested
  class SchoolYearDeletion {

    @Test
    void deletingSchoolYear_cascadesToTermsAndDependentEntities() {
      // Given: A school year with terms, lessons, and teacher availabilities
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      TeacherAvailability availability = testData.availability(teacher).withTerm(term).persist();
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      UUID schoolYearId = schoolYear.getId();
      UUID termId = term.getId();
      UUID availabilityId = availability.getId();
      UUID lessonId = lesson.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the school year
      SchoolYear schoolYearToDelete = entityManager.find(SchoolYear.class, schoolYearId);
      entityManager.remove(schoolYearToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: Terms, availabilities, and lessons should be deleted
      assertThat(entityManager.find(SchoolYear.class, schoolYearId)).isNull();
      assertThat(entityManager.find(Term.class, termId)).isNull();
      assertThat(entityManager.find(TeacherAvailability.class, availabilityId)).isNull();
      assertThat(entityManager.find(Lesson.class, lessonId)).isNull();
    }
  }

  @Nested
  class TermDeletion {

    @Test
    void deletingTerm_cascadesToLessonsAndAvailabilities() {
      // Given: A term with lessons and teacher availabilities
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      TeacherAvailability availability = testData.availability(teacher).withTerm(term).persist();
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      UUID termId = term.getId();
      UUID availabilityId = availability.getId();
      UUID lessonId = lesson.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the term
      Term termToDelete = entityManager.find(Term.class, termId);
      entityManager.remove(termToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: Lessons and availabilities should be deleted
      assertThat(entityManager.find(Term.class, termId)).isNull();
      assertThat(entityManager.find(TeacherAvailability.class, availabilityId)).isNull();
      assertThat(entityManager.find(Lesson.class, lessonId)).isNull();
    }
  }

  @Nested
  class RoomDeletion {

    @Test
    void deletingRoom_setsLessonRoomToNull() {
      // Given: A room assigned to a lesson
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      Room room = testData.room(school).persist();
      Lesson lesson =
          testData.lesson(term, schoolClass, teacher, subject, timeSlot).withRoom(room).persist();

      UUID roomId = room.getId();
      UUID lessonId = lesson.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the room
      Room roomToDelete = entityManager.find(Room.class, roomId);
      entityManager.remove(roomToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: Lesson should still exist but room should be null
      assertThat(entityManager.find(Room.class, roomId)).isNull();
      Lesson reloadedLesson = entityManager.find(Lesson.class, lessonId);
      assertThat(reloadedLesson).isNotNull();
      assertThat(reloadedLesson.getRoom()).isNull();
    }
  }

  @Nested
  class SchoolClassDeletion {

    @Test
    void deletingSchoolClass_cascadesToLessons() {
      // Given: A school class with lessons
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      UUID schoolClassId = schoolClass.getId();
      UUID lessonId = lesson.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the school class
      SchoolClass schoolClassToDelete = entityManager.find(SchoolClass.class, schoolClassId);
      entityManager.remove(schoolClassToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: Lessons should be deleted
      assertThat(entityManager.find(SchoolClass.class, schoolClassId)).isNull();
      assertThat(entityManager.find(Lesson.class, lessonId)).isNull();
    }
  }

  @Nested
  class TimeSlotDeletion {

    @Test
    void deletingTimeSlot_cascadesToLessons() {
      // Given: A time slot with lessons
      School school = testData.school().persist();
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      Term term = testData.term(schoolYear).persist();
      Teacher teacher = testData.teacher(school).persist();
      Subject subject = testData.subject(school).persist();
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      Lesson lesson = testData.lesson(term, schoolClass, teacher, subject, timeSlot).persist();

      UUID timeSlotId = timeSlot.getId();
      UUID lessonId = lesson.getId();

      entityManager.flush();
      entityManager.clear();

      // When: Delete the time slot
      TimeSlot timeSlotToDelete = entityManager.find(TimeSlot.class, timeSlotId);
      entityManager.remove(timeSlotToDelete);
      entityManager.flush();
      entityManager.clear();

      // Then: Lessons should be deleted
      assertThat(entityManager.find(TimeSlot.class, timeSlotId)).isNull();
      assertThat(entityManager.find(Lesson.class, lessonId)).isNull();
    }
  }
}
