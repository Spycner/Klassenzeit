package com.klassenzeit.klassenzeit.teacher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.AvailabilityType;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolYear;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.teacher.dto.AvailabilityResponse;
import com.klassenzeit.klassenzeit.teacher.dto.AvailabilitySummary;
import com.klassenzeit.klassenzeit.teacher.dto.CreateAvailabilityRequest;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateAvailabilityRequest;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TeacherAvailabilityServiceTest extends AbstractIntegrationTest {

  @Autowired private TeacherAvailabilityService availabilityService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private Teacher teacher;
  private Term term;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    teacher = testData.teacher(school).withFirstName("Max").withLastName("Mustermann").persist();
    SchoolYear schoolYear = testData.schoolYear(school).persist();
    term = testData.term(schoolYear).persist();
  }

  @Nested
  class FindAllByTeacher {

    @Test
    void returnsAllAvailabilitiesForTeacher() {
      testData
          .availability(teacher)
          .withDayOfWeek((short) 0)
          .withPeriod((short) 1)
          .withType(AvailabilityType.BLOCKED)
          .persist();
      testData
          .availability(teacher)
          .withDayOfWeek((short) 0)
          .withPeriod((short) 2)
          .withType(AvailabilityType.PREFERRED)
          .persist();
      entityManager.flush();
      entityManager.clear();

      List<AvailabilitySummary> result =
          availabilityService.findAllByTeacher(school.getId(), teacher.getId());

      assertThat(result).hasSize(2);
    }

    @Test
    void doesNotReturnAvailabilitiesFromOtherTeacher() {
      testData.availability(teacher).withDayOfWeek((short) 0).withPeriod((short) 1).persist();

      Teacher otherTeacher = testData.teacher(school).withLastName("Schmidt").persist();
      testData.availability(otherTeacher).withDayOfWeek((short) 1).withPeriod((short) 1).persist();
      entityManager.flush();
      entityManager.clear();

      List<AvailabilitySummary> result =
          availabilityService.findAllByTeacher(school.getId(), teacher.getId());

      assertThat(result).hasSize(1);
    }

    @Test
    void returnsEmptyListWhenNoAvailabilities() {
      entityManager.flush();
      entityManager.clear();

      List<AvailabilitySummary> result =
          availabilityService.findAllByTeacher(school.getId(), teacher.getId());

      assertThat(result).isEmpty();
    }

    @Test
    void throwsWhenTeacherBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Teacher otherTeacher = testData.teacher(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> availabilityService.findAllByTeacher(school.getId(), otherTeacher.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsAvailabilityWhenFound() {
      TeacherAvailability availability =
          testData
              .availability(teacher)
              .withTerm(term)
              .withDayOfWeek((short) 1)
              .withPeriod((short) 2)
              .withType(AvailabilityType.BLOCKED)
              .withReason("Doctor appointment")
              .persist();
      entityManager.flush();
      entityManager.clear();

      AvailabilityResponse result =
          availabilityService.findById(school.getId(), teacher.getId(), availability.getId());

      assertThat(result.id()).isEqualTo(availability.getId());
      assertThat(result.termId()).isEqualTo(term.getId());
      assertThat(result.termName()).isEqualTo(term.getName());
      assertThat(result.dayOfWeek()).isEqualTo((short) 1);
      assertThat(result.period()).isEqualTo((short) 2);
      assertThat(result.availabilityType()).isEqualTo(AvailabilityType.BLOCKED);
      assertThat(result.reason()).isEqualTo("Doctor appointment");
      assertThat(result.isGlobal()).isFalse();
      assertThat(result.createdAt()).isNotNull();
      assertThat(result.updatedAt()).isNotNull();
    }

    @Test
    void returnsGlobalAvailability() {
      TeacherAvailability availability =
          testData
              .availability(teacher)
              .global()
              .withDayOfWeek((short) 1)
              .withPeriod((short) 1)
              .withType(AvailabilityType.BLOCKED)
              .persist();
      entityManager.flush();
      entityManager.clear();

      AvailabilityResponse result =
          availabilityService.findById(school.getId(), teacher.getId(), availability.getId());

      assertThat(result.termId()).isNull();
      assertThat(result.termName()).isNull();
      assertThat(result.isGlobal()).isTrue();
    }

    @Test
    void throwsWhenAvailabilityNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(
              () -> availabilityService.findById(school.getId(), teacher.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("TeacherAvailability")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenAvailabilityBelongsToDifferentTeacher() {
      Teacher otherTeacher = testData.teacher(school).withLastName("Schmidt").persist();
      TeacherAvailability availability = testData.availability(otherTeacher).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () ->
                  availabilityService.findById(
                      school.getId(), teacher.getId(), availability.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsAvailabilitySuccessfully() {
      entityManager.flush();
      entityManager.clear();

      CreateAvailabilityRequest request =
          new CreateAvailabilityRequest(
              term.getId(), (short) 1, (short) 2, AvailabilityType.BLOCKED, "Doctor appointment");

      AvailabilityResponse result =
          availabilityService.create(school.getId(), teacher.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.termId()).isEqualTo(term.getId());
      assertThat(result.dayOfWeek()).isEqualTo((short) 1);
      assertThat(result.period()).isEqualTo((short) 2);
      assertThat(result.availabilityType()).isEqualTo(AvailabilityType.BLOCKED);
      assertThat(result.reason()).isEqualTo("Doctor appointment");
      assertThat(result.isGlobal()).isFalse();
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void createsGlobalAvailability() {
      entityManager.flush();
      entityManager.clear();

      CreateAvailabilityRequest request =
          new CreateAvailabilityRequest(
              null, (short) 1, (short) 1, AvailabilityType.PREFERRED, null);

      AvailabilityResponse result =
          availabilityService.create(school.getId(), teacher.getId(), request);

      assertThat(result.termId()).isNull();
      assertThat(result.isGlobal()).isTrue();
    }

    @Test
    void throwsWhenTeacherNotFound() {
      UUID nonExistentTeacherId = UUID.randomUUID();
      CreateAvailabilityRequest request =
          new CreateAvailabilityRequest(null, (short) 1, (short) 1, AvailabilityType.BLOCKED, null);

      assertThatThrownBy(
              () -> availabilityService.create(school.getId(), nonExistentTeacherId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }

    @Test
    void throwsWhenTermNotFound() {
      UUID nonExistentTermId = UUID.randomUUID();
      CreateAvailabilityRequest request =
          new CreateAvailabilityRequest(
              nonExistentTermId, (short) 1, (short) 1, AvailabilityType.BLOCKED, null);

      assertThatThrownBy(() -> availabilityService.create(school.getId(), teacher.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Term");
    }

    @Test
    void throwsWhenTermBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolYear otherSchoolYear = testData.schoolYear(otherSchool).persist();
      Term otherTerm = testData.term(otherSchoolYear).persist();
      entityManager.flush();
      entityManager.clear();

      CreateAvailabilityRequest request =
          new CreateAvailabilityRequest(
              otherTerm.getId(), (short) 1, (short) 1, AvailabilityType.BLOCKED, null);

      assertThatThrownBy(() -> availabilityService.create(school.getId(), teacher.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Term");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      TeacherAvailability availability =
          testData
              .availability(teacher)
              .withDayOfWeek((short) 0)
              .withPeriod((short) 1)
              .withType(AvailabilityType.AVAILABLE)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateAvailabilityRequest request =
          new UpdateAvailabilityRequest(
              (short) 1, (short) 2, AvailabilityType.BLOCKED, "Updated reason");

      AvailabilityResponse result =
          availabilityService.update(
              school.getId(), teacher.getId(), availability.getId(), request);

      assertThat(result.dayOfWeek()).isEqualTo((short) 1);
      assertThat(result.period()).isEqualTo((short) 2);
      assertThat(result.availabilityType()).isEqualTo(AvailabilityType.BLOCKED);
      assertThat(result.reason()).isEqualTo("Updated reason");
    }

    @Test
    void updatesOnlyProvidedFields() {
      TeacherAvailability availability =
          testData
              .availability(teacher)
              .withDayOfWeek((short) 0)
              .withPeriod((short) 1)
              .withType(AvailabilityType.BLOCKED)
              .withReason("Original reason")
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateAvailabilityRequest request =
          new UpdateAvailabilityRequest(null, null, AvailabilityType.PREFERRED, null);

      AvailabilityResponse result =
          availabilityService.update(
              school.getId(), teacher.getId(), availability.getId(), request);

      assertThat(result.dayOfWeek()).isEqualTo((short) 0); // unchanged
      assertThat(result.period()).isEqualTo((short) 1); // unchanged
      assertThat(result.availabilityType()).isEqualTo(AvailabilityType.PREFERRED);
      assertThat(result.reason()).isEqualTo("Original reason"); // unchanged
    }

    @Test
    void throwsWhenAvailabilityNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateAvailabilityRequest request =
          new UpdateAvailabilityRequest(null, null, AvailabilityType.PREFERRED, null);

      assertThatThrownBy(
              () ->
                  availabilityService.update(
                      school.getId(), teacher.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenAvailabilityBelongsToDifferentTeacher() {
      Teacher otherTeacher = testData.teacher(school).withLastName("Schmidt").persist();
      TeacherAvailability availability = testData.availability(otherTeacher).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateAvailabilityRequest request =
          new UpdateAvailabilityRequest(null, null, AvailabilityType.PREFERRED, null);

      assertThatThrownBy(
              () ->
                  availabilityService.update(
                      school.getId(), teacher.getId(), availability.getId(), request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesAvailability() {
      TeacherAvailability availability = testData.availability(teacher).persist();
      UUID availabilityId = availability.getId();
      entityManager.flush();
      entityManager.clear();

      availabilityService.delete(school.getId(), teacher.getId(), availabilityId);

      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> availabilityService.findById(school.getId(), teacher.getId(), availabilityId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenAvailabilityNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(
              () -> availabilityService.delete(school.getId(), teacher.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenAvailabilityBelongsToDifferentTeacher() {
      Teacher otherTeacher = testData.teacher(school).withLastName("Schmidt").persist();
      TeacherAvailability availability = testData.availability(otherTeacher).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () ->
                  availabilityService.delete(school.getId(), teacher.getId(), availability.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
