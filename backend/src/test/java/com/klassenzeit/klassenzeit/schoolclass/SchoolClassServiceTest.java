package com.klassenzeit.klassenzeit.schoolclass;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.schoolclass.dto.CreateSchoolClassRequest;
import com.klassenzeit.klassenzeit.schoolclass.dto.SchoolClassResponse;
import com.klassenzeit.klassenzeit.schoolclass.dto.SchoolClassSummary;
import com.klassenzeit.klassenzeit.schoolclass.dto.UpdateSchoolClassRequest;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class SchoolClassServiceTest extends AbstractIntegrationTest {

  @Autowired private SchoolClassService schoolClassService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Nested
  class FindAllBySchool {

    @Test
    void returnsAllSchoolClassesForSchool() {
      testData.schoolClass(school).withName("1a").withGradeLevel((short) 1).persist();
      testData.schoolClass(school).withName("1b").withGradeLevel((short) 1).persist();
      entityManager.flush();
      entityManager.clear();

      List<SchoolClassSummary> result = schoolClassService.findAllBySchool(school.getId());

      assertThat(result).hasSize(2);
      assertThat(result).extracting(SchoolClassSummary::name).containsExactlyInAnyOrder("1a", "1b");
    }

    @Test
    void doesNotReturnSchoolClassesFromOtherSchool() {
      testData.schoolClass(school).withName("1a").persist();

      School otherSchool = testData.school().withSlug("other-school").persist();
      testData.schoolClass(otherSchool).withName("2a").persist();
      entityManager.flush();
      entityManager.clear();

      List<SchoolClassSummary> result = schoolClassService.findAllBySchool(school.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).name()).isEqualTo("1a");
    }

    @Test
    void returnsEmptyListWhenNoSchoolClasses() {
      entityManager.flush();
      entityManager.clear();

      List<SchoolClassSummary> result = schoolClassService.findAllBySchool(school.getId());

      assertThat(result).isEmpty();
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsSchoolClassWhenFound() {
      Teacher teacher =
          testData.teacher(school).withFirstName("Max").withLastName("Mustermann").persist();
      SchoolClass schoolClass =
          testData
              .schoolClass(school)
              .withName("1a")
              .withGradeLevel((short) 1)
              .withStudentCount(25)
              .withClassTeacher(teacher)
              .persist();
      entityManager.flush();
      entityManager.clear();

      SchoolClassResponse result = schoolClassService.findById(school.getId(), schoolClass.getId());

      assertThat(result.id()).isEqualTo(schoolClass.getId());
      assertThat(result.name()).isEqualTo("1a");
      assertThat(result.gradeLevel()).isEqualTo((short) 1);
      assertThat(result.studentCount()).isEqualTo(25);
      assertThat(result.classTeacherId()).isEqualTo(teacher.getId());
      assertThat(result.classTeacherName()).isEqualTo("Max Mustermann");
      assertThat(result.isActive()).isTrue();
      assertThat(result.createdAt()).isNotNull();
      assertThat(result.updatedAt()).isNotNull();
    }

    @Test
    void returnsSchoolClassWithoutTeacher() {
      SchoolClass schoolClass =
          testData.schoolClass(school).withName("1a").withGradeLevel((short) 1).persist();
      entityManager.flush();
      entityManager.clear();

      SchoolClassResponse result = schoolClassService.findById(school.getId(), schoolClass.getId());

      assertThat(result.classTeacherId()).isNull();
      assertThat(result.classTeacherName()).isNull();
    }

    @Test
    void throwsWhenSchoolClassNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> schoolClassService.findById(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("SchoolClass")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenSchoolClassBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolClass schoolClass = testData.schoolClass(otherSchool).withName("2a").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> schoolClassService.findById(school.getId(), schoolClass.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsSchoolClassSuccessfully() {
      CreateSchoolClassRequest request = new CreateSchoolClassRequest("1a", (short) 1, 25, null);

      SchoolClassResponse result = schoolClassService.create(school.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.name()).isEqualTo("1a");
      assertThat(result.gradeLevel()).isEqualTo((short) 1);
      assertThat(result.studentCount()).isEqualTo(25);
      assertThat(result.classTeacherId()).isNull();
      assertThat(result.isActive()).isTrue();
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void createsSchoolClassWithClassTeacher() {
      Teacher teacher =
          testData.teacher(school).withFirstName("Max").withLastName("Mustermann").persist();
      entityManager.flush();
      entityManager.clear();

      CreateSchoolClassRequest request =
          new CreateSchoolClassRequest("1a", (short) 1, 25, teacher.getId());

      SchoolClassResponse result = schoolClassService.create(school.getId(), request);

      assertThat(result.classTeacherId()).isEqualTo(teacher.getId());
      assertThat(result.classTeacherName()).isEqualTo("Max Mustermann");
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentSchoolId = UUID.randomUUID();
      CreateSchoolClassRequest request = new CreateSchoolClassRequest("1a", (short) 1, 25, null);

      assertThatThrownBy(() -> schoolClassService.create(nonExistentSchoolId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }

    @Test
    void throwsWhenClassTeacherNotFound() {
      UUID nonExistentTeacherId = UUID.randomUUID();
      CreateSchoolClassRequest request =
          new CreateSchoolClassRequest("1a", (short) 1, 25, nonExistentTeacherId);

      assertThatThrownBy(() -> schoolClassService.create(school.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }

    @Test
    void throwsWhenClassTeacherBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Teacher otherTeacher = testData.teacher(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      CreateSchoolClassRequest request =
          new CreateSchoolClassRequest("1a", (short) 1, 25, otherTeacher.getId());

      assertThatThrownBy(() -> schoolClassService.create(school.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      Teacher teacher = testData.teacher(school).persist();
      SchoolClass schoolClass =
          testData
              .schoolClass(school)
              .withName("1a")
              .withGradeLevel((short) 1)
              .withStudentCount(25)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolClassRequest request =
          new UpdateSchoolClassRequest("2b", (short) 2, 30, teacher.getId(), null, false, null);

      SchoolClassResponse result =
          schoolClassService.update(school.getId(), schoolClass.getId(), request);

      assertThat(result.name()).isEqualTo("2b");
      assertThat(result.gradeLevel()).isEqualTo((short) 2);
      assertThat(result.studentCount()).isEqualTo(30);
      assertThat(result.classTeacherId()).isEqualTo(teacher.getId());
      assertThat(result.isActive()).isFalse();
    }

    @Test
    void updatesOnlyProvidedFields() {
      SchoolClass schoolClass =
          testData
              .schoolClass(school)
              .withName("1a")
              .withGradeLevel((short) 1)
              .withStudentCount(25)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolClassRequest request =
          new UpdateSchoolClassRequest("1b", null, null, null, null, null, null);

      SchoolClassResponse result =
          schoolClassService.update(school.getId(), schoolClass.getId(), request);

      assertThat(result.name()).isEqualTo("1b");
      assertThat(result.gradeLevel()).isEqualTo((short) 1); // unchanged
      assertThat(result.studentCount()).isEqualTo(25); // unchanged
      assertThat(result.isActive()).isTrue(); // unchanged
    }

    @Test
    void throwsWhenSchoolClassNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateSchoolClassRequest request =
          new UpdateSchoolClassRequest("Updated", null, null, null, null, null, null);

      assertThatThrownBy(() -> schoolClassService.update(school.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSchoolClassBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolClass schoolClass = testData.schoolClass(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolClassRequest request =
          new UpdateSchoolClassRequest("Updated", null, null, null, null, null, null);

      assertThatThrownBy(
              () -> schoolClassService.update(school.getId(), schoolClass.getId(), request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void softDeletesSchoolClass() {
      SchoolClass schoolClass = testData.schoolClass(school).persist();
      entityManager.flush();
      entityManager.clear();

      schoolClassService.delete(school.getId(), schoolClass.getId());

      entityManager.flush();
      entityManager.clear();

      SchoolClassResponse result = schoolClassService.findById(school.getId(), schoolClass.getId());
      assertThat(result.isActive()).isFalse();
    }

    @Test
    void throwsWhenSchoolClassNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> schoolClassService.delete(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSchoolClassBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolClass schoolClass = testData.schoolClass(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> schoolClassService.delete(school.getId(), schoolClass.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
