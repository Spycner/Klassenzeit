package com.klassenzeit.klassenzeit.school;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.dto.CreateSchoolYearRequest;
import com.klassenzeit.klassenzeit.school.dto.SchoolYearResponse;
import com.klassenzeit.klassenzeit.school.dto.SchoolYearSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateSchoolYearRequest;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class SchoolYearServiceTest extends AbstractIntegrationTest {

  @Autowired private SchoolYearService schoolYearService;
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
    void returnsAllSchoolYearsForSchool() {
      testData
          .schoolYear(school)
          .withName("2023/2024")
          .withDates(LocalDate.of(2023, 8, 1), LocalDate.of(2024, 7, 31))
          .persist();
      testData
          .schoolYear(school)
          .withName("2024/2025")
          .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 7, 31))
          .persist();
      entityManager.flush();
      entityManager.clear();

      List<SchoolYearSummary> result = schoolYearService.findAllBySchool(school.getId());

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(SchoolYearSummary::name)
          .containsExactlyInAnyOrder("2023/2024", "2024/2025");
    }

    @Test
    void doesNotReturnSchoolYearsFromOtherSchool() {
      testData.schoolYear(school).withName("2024/2025").persist();

      School otherSchool = testData.school().withSlug("other-school").persist();
      testData.schoolYear(otherSchool).withName("2025/2026").persist();
      entityManager.flush();
      entityManager.clear();

      List<SchoolYearSummary> result = schoolYearService.findAllBySchool(school.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).name()).isEqualTo("2024/2025");
    }

    @Test
    void returnsEmptyListWhenNoSchoolYears() {
      entityManager.flush();
      entityManager.clear();

      List<SchoolYearSummary> result = schoolYearService.findAllBySchool(school.getId());

      assertThat(result).isEmpty();
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsSchoolYearWhenFound() {
      SchoolYear schoolYear =
          testData
              .schoolYear(school)
              .withName("2024/2025")
              .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 7, 31))
              .isCurrent(true)
              .persist();
      entityManager.flush();
      entityManager.clear();

      SchoolYearResponse result = schoolYearService.findById(school.getId(), schoolYear.getId());

      assertThat(result.id()).isEqualTo(schoolYear.getId());
      assertThat(result.name()).isEqualTo("2024/2025");
      assertThat(result.startDate()).isEqualTo(LocalDate.of(2024, 8, 1));
      assertThat(result.endDate()).isEqualTo(LocalDate.of(2025, 7, 31));
      assertThat(result.isCurrent()).isTrue();
      assertThat(result.createdAt()).isNotNull();
      assertThat(result.updatedAt()).isNotNull();
    }

    @Test
    void throwsWhenSchoolYearNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> schoolYearService.findById(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("SchoolYear")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenSchoolYearBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolYear schoolYear = testData.schoolYear(otherSchool).withName("2024/2025").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> schoolYearService.findById(school.getId(), schoolYear.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsSchoolYearSuccessfully() {
      CreateSchoolYearRequest request =
          new CreateSchoolYearRequest(
              "2024/2025", LocalDate.of(2024, 8, 1), LocalDate.of(2025, 7, 31), true);

      SchoolYearResponse result = schoolYearService.create(school.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.name()).isEqualTo("2024/2025");
      assertThat(result.startDate()).isEqualTo(LocalDate.of(2024, 8, 1));
      assertThat(result.endDate()).isEqualTo(LocalDate.of(2025, 7, 31));
      assertThat(result.isCurrent()).isTrue();
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void createsSchoolYearWithDefaultIsCurrent() {
      CreateSchoolYearRequest request =
          new CreateSchoolYearRequest(
              "2024/2025", LocalDate.of(2024, 8, 1), LocalDate.of(2025, 7, 31), null);

      SchoolYearResponse result = schoolYearService.create(school.getId(), request);

      assertThat(result.name()).isEqualTo("2024/2025");
      assertThat(result.isCurrent()).isFalse();
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentSchoolId = UUID.randomUUID();
      CreateSchoolYearRequest request =
          new CreateSchoolYearRequest(
              "2024/2025", LocalDate.of(2024, 8, 1), LocalDate.of(2025, 7, 31), null);

      assertThatThrownBy(() -> schoolYearService.create(nonExistentSchoolId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      SchoolYear schoolYear =
          testData
              .schoolYear(school)
              .withName("2024/2025")
              .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 7, 31))
              .isCurrent(false)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolYearRequest request =
          new UpdateSchoolYearRequest(
              "2025/2026", LocalDate.of(2025, 8, 1), LocalDate.of(2026, 7, 31), true, null);

      SchoolYearResponse result =
          schoolYearService.update(school.getId(), schoolYear.getId(), request);

      assertThat(result.name()).isEqualTo("2025/2026");
      assertThat(result.startDate()).isEqualTo(LocalDate.of(2025, 8, 1));
      assertThat(result.endDate()).isEqualTo(LocalDate.of(2026, 7, 31));
      assertThat(result.isCurrent()).isTrue();
    }

    @Test
    void updatesOnlyProvidedFields() {
      SchoolYear schoolYear =
          testData
              .schoolYear(school)
              .withName("2024/2025")
              .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 7, 31))
              .isCurrent(false)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolYearRequest request =
          new UpdateSchoolYearRequest("Updated Name", null, null, null, null);

      SchoolYearResponse result =
          schoolYearService.update(school.getId(), schoolYear.getId(), request);

      assertThat(result.name()).isEqualTo("Updated Name");
      assertThat(result.startDate()).isEqualTo(LocalDate.of(2024, 8, 1)); // unchanged
      assertThat(result.endDate()).isEqualTo(LocalDate.of(2025, 7, 31)); // unchanged
      assertThat(result.isCurrent()).isFalse(); // unchanged
    }

    @Test
    void throwsWhenSchoolYearNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateSchoolYearRequest request =
          new UpdateSchoolYearRequest("Updated", null, null, null, null);

      assertThatThrownBy(() -> schoolYearService.update(school.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSchoolYearBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolYear schoolYear = testData.schoolYear(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolYearRequest request =
          new UpdateSchoolYearRequest("Updated", null, null, null, null);

      assertThatThrownBy(
              () -> schoolYearService.update(school.getId(), schoolYear.getId(), request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesSchoolYear() {
      SchoolYear schoolYear = testData.schoolYear(school).persist();
      UUID schoolYearId = schoolYear.getId();
      entityManager.flush();
      entityManager.clear();

      schoolYearService.delete(school.getId(), schoolYearId);

      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> schoolYearService.findById(school.getId(), schoolYearId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSchoolYearNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> schoolYearService.delete(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSchoolYearBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolYear schoolYear = testData.schoolYear(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> schoolYearService.delete(school.getId(), schoolYear.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
