package com.klassenzeit.klassenzeit.teacher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.common.QualificationLevel;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.dto.CreateQualificationRequest;
import com.klassenzeit.klassenzeit.teacher.dto.QualificationResponse;
import com.klassenzeit.klassenzeit.teacher.dto.QualificationSummary;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateQualificationRequest;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TeacherQualificationServiceTest extends AbstractIntegrationTest {

  @Autowired private TeacherQualificationService qualificationService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private Teacher teacher;
  private Subject subject;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    teacher = testData.teacher(school).withFirstName("Max").withLastName("Mustermann").persist();
    subject = testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
  }

  @Nested
  class FindAllByTeacher {

    @Test
    void returnsAllQualificationsForTeacher() {
      Subject subject2 =
          testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();
      testData.qualification(teacher, subject).persist();
      testData.qualification(teacher, subject2).persist();
      entityManager.flush();
      entityManager.clear();

      List<QualificationSummary> result =
          qualificationService.findAllByTeacher(school.getId(), teacher.getId());

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(QualificationSummary::subjectName)
          .containsExactlyInAnyOrder("Mathematik", "Deutsch");
    }

    @Test
    void doesNotReturnQualificationsFromOtherTeacher() {
      testData.qualification(teacher, subject).persist();

      Teacher otherTeacher = testData.teacher(school).withLastName("Schmidt").persist();
      Subject otherSubject =
          testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();
      testData.qualification(otherTeacher, otherSubject).persist();
      entityManager.flush();
      entityManager.clear();

      List<QualificationSummary> result =
          qualificationService.findAllByTeacher(school.getId(), teacher.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).subjectName()).isEqualTo("Mathematik");
    }

    @Test
    void returnsEmptyListWhenNoQualifications() {
      entityManager.flush();
      entityManager.clear();

      List<QualificationSummary> result =
          qualificationService.findAllByTeacher(school.getId(), teacher.getId());

      assertThat(result).isEmpty();
    }

    @Test
    void throwsWhenTeacherBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Teacher otherTeacher = testData.teacher(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> qualificationService.findAllByTeacher(school.getId(), otherTeacher.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsQualificationWhenFound() {
      TeacherSubjectQualification qualification =
          testData
              .qualification(teacher, subject)
              .withLevel(QualificationLevel.PRIMARY)
              .withGrades(List.of(1, 2, 3, 4))
              .withMaxHours(10)
              .persist();
      entityManager.flush();
      entityManager.clear();

      QualificationResponse result =
          qualificationService.findById(school.getId(), teacher.getId(), qualification.getId());

      assertThat(result.id()).isEqualTo(qualification.getId());
      assertThat(result.subjectId()).isEqualTo(subject.getId());
      assertThat(result.subjectName()).isEqualTo("Mathematik");
      assertThat(result.qualificationLevel()).isEqualTo(QualificationLevel.PRIMARY);
      assertThat(result.canTeachGrades()).containsExactly(1, 2, 3, 4);
      assertThat(result.maxHoursPerWeek()).isEqualTo(10);
      assertThat(result.createdAt()).isNotNull();
      assertThat(result.updatedAt()).isNotNull();
    }

    @Test
    void throwsWhenQualificationNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(
              () -> qualificationService.findById(school.getId(), teacher.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("TeacherSubjectQualification")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenQualificationBelongsToDifferentTeacher() {
      Teacher otherTeacher = testData.teacher(school).withLastName("Schmidt").persist();
      TeacherSubjectQualification qualification =
          testData.qualification(otherTeacher, subject).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () ->
                  qualificationService.findById(
                      school.getId(), teacher.getId(), qualification.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsQualificationSuccessfully() {
      entityManager.flush();
      entityManager.clear();

      CreateQualificationRequest request =
          new CreateQualificationRequest(
              subject.getId(), QualificationLevel.PRIMARY, List.of(1, 2, 3, 4), 10);

      QualificationResponse result =
          qualificationService.create(school.getId(), teacher.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.subjectId()).isEqualTo(subject.getId());
      assertThat(result.subjectName()).isEqualTo("Mathematik");
      assertThat(result.qualificationLevel()).isEqualTo(QualificationLevel.PRIMARY);
      assertThat(result.canTeachGrades()).containsExactly(1, 2, 3, 4);
      assertThat(result.maxHoursPerWeek()).isEqualTo(10);
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void createsQualificationWithNullOptionalFields() {
      entityManager.flush();
      entityManager.clear();

      CreateQualificationRequest request =
          new CreateQualificationRequest(subject.getId(), QualificationLevel.SECONDARY, null, null);

      QualificationResponse result =
          qualificationService.create(school.getId(), teacher.getId(), request);

      assertThat(result.qualificationLevel()).isEqualTo(QualificationLevel.SECONDARY);
      assertThat(result.canTeachGrades()).isNull();
      assertThat(result.maxHoursPerWeek()).isNull();
    }

    @Test
    void throwsWhenTeacherNotFound() {
      UUID nonExistentTeacherId = UUID.randomUUID();
      CreateQualificationRequest request =
          new CreateQualificationRequest(subject.getId(), QualificationLevel.PRIMARY, null, null);

      assertThatThrownBy(
              () -> qualificationService.create(school.getId(), nonExistentTeacherId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }

    @Test
    void throwsWhenSubjectNotFound() {
      UUID nonExistentSubjectId = UUID.randomUUID();
      CreateQualificationRequest request =
          new CreateQualificationRequest(
              nonExistentSubjectId, QualificationLevel.PRIMARY, null, null);

      assertThatThrownBy(
              () -> qualificationService.create(school.getId(), teacher.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Subject");
    }

    @Test
    void throwsWhenSubjectBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Subject otherSubject =
          testData.subject(otherSchool).withName("Englisch").withAbbreviation("EN").persist();
      entityManager.flush();
      entityManager.clear();

      CreateQualificationRequest request =
          new CreateQualificationRequest(
              otherSubject.getId(), QualificationLevel.PRIMARY, null, null);

      assertThatThrownBy(
              () -> qualificationService.create(school.getId(), teacher.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Subject");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      TeacherSubjectQualification qualification =
          testData
              .qualification(teacher, subject)
              .withLevel(QualificationLevel.SECONDARY)
              .withGrades(List.of(1, 2))
              .withMaxHours(5)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateQualificationRequest request =
          new UpdateQualificationRequest(QualificationLevel.PRIMARY, List.of(1, 2, 3, 4), 10);

      QualificationResponse result =
          qualificationService.update(
              school.getId(), teacher.getId(), qualification.getId(), request);

      assertThat(result.qualificationLevel()).isEqualTo(QualificationLevel.PRIMARY);
      assertThat(result.canTeachGrades()).containsExactly(1, 2, 3, 4);
      assertThat(result.maxHoursPerWeek()).isEqualTo(10);
    }

    @Test
    void updatesOnlyProvidedFields() {
      TeacherSubjectQualification qualification =
          testData
              .qualification(teacher, subject)
              .withLevel(QualificationLevel.PRIMARY)
              .withGrades(List.of(1, 2, 3, 4))
              .withMaxHours(10)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateQualificationRequest request =
          new UpdateQualificationRequest(QualificationLevel.SECONDARY, null, null);

      QualificationResponse result =
          qualificationService.update(
              school.getId(), teacher.getId(), qualification.getId(), request);

      assertThat(result.qualificationLevel()).isEqualTo(QualificationLevel.SECONDARY);
      assertThat(result.canTeachGrades()).containsExactly(1, 2, 3, 4); // unchanged
      assertThat(result.maxHoursPerWeek()).isEqualTo(10); // unchanged
    }

    @Test
    void throwsWhenQualificationNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateQualificationRequest request =
          new UpdateQualificationRequest(QualificationLevel.SECONDARY, null, null);

      assertThatThrownBy(
              () ->
                  qualificationService.update(
                      school.getId(), teacher.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenQualificationBelongsToDifferentTeacher() {
      Teacher otherTeacher = testData.teacher(school).withLastName("Schmidt").persist();
      TeacherSubjectQualification qualification =
          testData.qualification(otherTeacher, subject).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateQualificationRequest request =
          new UpdateQualificationRequest(QualificationLevel.SECONDARY, null, null);

      assertThatThrownBy(
              () ->
                  qualificationService.update(
                      school.getId(), teacher.getId(), qualification.getId(), request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesQualification() {
      TeacherSubjectQualification qualification =
          testData.qualification(teacher, subject).persist();
      UUID qualificationId = qualification.getId();
      entityManager.flush();
      entityManager.clear();

      qualificationService.delete(school.getId(), teacher.getId(), qualificationId);

      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> qualificationService.findById(school.getId(), teacher.getId(), qualificationId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenQualificationNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(
              () -> qualificationService.delete(school.getId(), teacher.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenQualificationBelongsToDifferentTeacher() {
      Teacher otherTeacher = testData.teacher(school).withLastName("Schmidt").persist();
      TeacherSubjectQualification qualification =
          testData.qualification(otherTeacher, subject).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () ->
                  qualificationService.delete(
                      school.getId(), teacher.getId(), qualification.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
