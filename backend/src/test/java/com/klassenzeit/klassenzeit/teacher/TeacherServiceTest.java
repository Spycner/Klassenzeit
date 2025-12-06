package com.klassenzeit.klassenzeit.teacher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.teacher.dto.CreateTeacherRequest;
import com.klassenzeit.klassenzeit.teacher.dto.TeacherResponse;
import com.klassenzeit.klassenzeit.teacher.dto.TeacherSummary;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateTeacherRequest;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TeacherServiceTest extends AbstractIntegrationTest {

  @Autowired private TeacherService teacherService;
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
    void returnsAllTeachersForSchool() {
      testData.teacher(school).withFirstName("Max").withLastName("Mustermann").persist();
      testData.teacher(school).withFirstName("Anna").withLastName("Schmidt").persist();
      entityManager.flush();
      entityManager.clear();

      List<TeacherSummary> result = teacherService.findAllBySchool(school.getId(), false);

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(TeacherSummary::lastName)
          .containsExactlyInAnyOrder("Mustermann", "Schmidt");
    }

    @Test
    void doesNotReturnTeachersFromOtherSchool() {
      testData.teacher(school).withLastName("Mustermann").persist();

      School otherSchool = testData.school().withSlug("other-school").persist();
      testData.teacher(otherSchool).withLastName("Schmidt").persist();
      entityManager.flush();
      entityManager.clear();

      List<TeacherSummary> result = teacherService.findAllBySchool(school.getId(), false);

      assertThat(result).hasSize(1);
      assertThat(result.get(0).lastName()).isEqualTo("Mustermann");
    }

    @Test
    void returnsEmptyListWhenNoTeachers() {
      entityManager.flush();
      entityManager.clear();

      List<TeacherSummary> result = teacherService.findAllBySchool(school.getId(), false);

      assertThat(result).isEmpty();
    }

    @Test
    void excludesInactiveTeachersWhenIncludeInactiveIsFalse() {
      testData.teacher(school).withLastName("Active").persist();
      Teacher inactive =
          testData.teacher(school).withLastName("Inactive").withAbbreviation("INA").persist();
      inactive.setActive(false);
      entityManager.flush();
      entityManager.clear();

      List<TeacherSummary> result = teacherService.findAllBySchool(school.getId(), false);

      assertThat(result).hasSize(1);
      assertThat(result.get(0).lastName()).isEqualTo("Active");
    }

    @Test
    void includesInactiveTeachersWhenIncludeInactiveIsTrue() {
      testData.teacher(school).withLastName("Active").persist();
      Teacher inactive =
          testData.teacher(school).withLastName("Inactive").withAbbreviation("INA").persist();
      inactive.setActive(false);
      entityManager.flush();
      entityManager.clear();

      List<TeacherSummary> result = teacherService.findAllBySchool(school.getId(), true);

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(TeacherSummary::lastName)
          .containsExactlyInAnyOrder("Active", "Inactive");
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsTeacherWhenFound() {
      Teacher teacher =
          testData
              .teacher(school)
              .withFirstName("Max")
              .withLastName("Mustermann")
              .withAbbreviation("MUM")
              .withEmail("max@example.com")
              .withMaxHours(28)
              .isPartTime(false)
              .persist();
      entityManager.flush();
      entityManager.clear();

      TeacherResponse result = teacherService.findById(school.getId(), teacher.getId());

      assertThat(result.id()).isEqualTo(teacher.getId());
      assertThat(result.firstName()).isEqualTo("Max");
      assertThat(result.lastName()).isEqualTo("Mustermann");
      assertThat(result.abbreviation()).isEqualTo("MUM");
      assertThat(result.email()).isEqualTo("max@example.com");
      assertThat(result.maxHoursPerWeek()).isEqualTo(28);
      assertThat(result.isPartTime()).isFalse();
      assertThat(result.isActive()).isTrue();
      assertThat(result.createdAt()).isNotNull();
      assertThat(result.updatedAt()).isNotNull();
    }

    @Test
    void throwsWhenTeacherNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> teacherService.findById(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenTeacherBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Teacher teacher = testData.teacher(otherSchool).withLastName("Schmidt").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> teacherService.findById(school.getId(), teacher.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsTeacherSuccessfully() {
      CreateTeacherRequest request =
          new CreateTeacherRequest("Max", "Mustermann", "max@example.com", "MUM", 28, false);

      TeacherResponse result = teacherService.create(school.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.firstName()).isEqualTo("Max");
      assertThat(result.lastName()).isEqualTo("Mustermann");
      assertThat(result.email()).isEqualTo("max@example.com");
      assertThat(result.abbreviation()).isEqualTo("MUM");
      assertThat(result.maxHoursPerWeek()).isEqualTo(28);
      assertThat(result.isPartTime()).isFalse();
      assertThat(result.isActive()).isTrue();
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void createsTeacherWithPartialFields() {
      CreateTeacherRequest request =
          new CreateTeacherRequest("Max", "Mustermann", null, "MUM", null, null);

      TeacherResponse result = teacherService.create(school.getId(), request);

      assertThat(result.firstName()).isEqualTo("Max");
      assertThat(result.lastName()).isEqualTo("Mustermann");
      assertThat(result.email()).isNull();
      assertThat(result.abbreviation()).isEqualTo("MUM");
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentSchoolId = UUID.randomUUID();
      CreateTeacherRequest request =
          new CreateTeacherRequest("Max", "Mustermann", null, "MUM", null, null);

      assertThatThrownBy(() -> teacherService.create(nonExistentSchoolId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      Teacher teacher =
          testData
              .teacher(school)
              .withFirstName("Max")
              .withLastName("Mustermann")
              .withAbbreviation("MUM")
              .withMaxHours(28)
              .isPartTime(false)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateTeacherRequest request =
          new UpdateTeacherRequest(
              "Anna", "Schmidt", "anna@example.com", "ASC", 20, true, false, null);

      TeacherResponse result = teacherService.update(school.getId(), teacher.getId(), request);

      assertThat(result.firstName()).isEqualTo("Anna");
      assertThat(result.lastName()).isEqualTo("Schmidt");
      assertThat(result.email()).isEqualTo("anna@example.com");
      assertThat(result.abbreviation()).isEqualTo("ASC");
      assertThat(result.maxHoursPerWeek()).isEqualTo(20);
      assertThat(result.isPartTime()).isTrue();
      assertThat(result.isActive()).isFalse();
    }

    @Test
    void updatesOnlyProvidedFields() {
      Teacher teacher =
          testData
              .teacher(school)
              .withFirstName("Max")
              .withLastName("Mustermann")
              .withAbbreviation("MUM")
              .withEmail("max@example.com")
              .withMaxHours(28)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateTeacherRequest request =
          new UpdateTeacherRequest("Anna", null, null, null, null, null, null, null);

      TeacherResponse result = teacherService.update(school.getId(), teacher.getId(), request);

      assertThat(result.firstName()).isEqualTo("Anna");
      assertThat(result.lastName()).isEqualTo("Mustermann"); // unchanged
      assertThat(result.email()).isEqualTo("max@example.com"); // unchanged
      assertThat(result.abbreviation()).isEqualTo("MUM"); // unchanged
      assertThat(result.maxHoursPerWeek()).isEqualTo(28); // unchanged
    }

    @Test
    void throwsWhenTeacherNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateTeacherRequest request =
          new UpdateTeacherRequest("Anna", null, null, null, null, null, null, null);

      assertThatThrownBy(() -> teacherService.update(school.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenTeacherBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Teacher teacher = testData.teacher(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateTeacherRequest request =
          new UpdateTeacherRequest("Updated", null, null, null, null, null, null, null);

      assertThatThrownBy(() -> teacherService.update(school.getId(), teacher.getId(), request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void softDeletesTeacher() {
      Teacher teacher = testData.teacher(school).persist();
      entityManager.flush();
      entityManager.clear();

      teacherService.delete(school.getId(), teacher.getId());

      entityManager.flush();
      entityManager.clear();

      // After soft-delete, findById should still return the teacher (for admin reactivation)
      TeacherResponse result = teacherService.findById(school.getId(), teacher.getId());
      assertThat(result.isActive()).isFalse();

      // Verify the teacher is still in the database but marked inactive
      Teacher deletedTeacher = entityManager.find(Teacher.class, teacher.getId());
      assertThat(deletedTeacher).isNotNull();
      assertThat(deletedTeacher.isActive()).isFalse();
    }

    @Test
    void permanentlyDeletesTeacher() {
      Teacher teacher = testData.teacher(school).persist();
      entityManager.flush();
      entityManager.clear();

      teacherService.deletePermanent(school.getId(), teacher.getId());

      entityManager.flush();
      entityManager.clear();

      // After permanent delete, the teacher should not exist
      Teacher deletedTeacher = entityManager.find(Teacher.class, teacher.getId());
      assertThat(deletedTeacher).isNull();
    }

    @Test
    void throwsWhenTeacherNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> teacherService.delete(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenTeacherBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Teacher teacher = testData.teacher(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> teacherService.delete(school.getId(), teacher.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
