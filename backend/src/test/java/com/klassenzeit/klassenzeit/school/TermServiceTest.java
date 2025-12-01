package com.klassenzeit.klassenzeit.school;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.dto.CreateTermRequest;
import com.klassenzeit.klassenzeit.school.dto.TermResponse;
import com.klassenzeit.klassenzeit.school.dto.TermSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateTermRequest;
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
class TermServiceTest extends AbstractIntegrationTest {

  @Autowired private TermService termService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private SchoolYear schoolYear;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    schoolYear = testData.schoolYear(school).persist();
  }

  @Nested
  class FindAllBySchoolYear {

    @Test
    void returnsAllTermsForSchoolYear() {
      testData
          .term(schoolYear)
          .withName("1. Halbjahr")
          .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31))
          .persist();
      testData
          .term(schoolYear)
          .withName("2. Halbjahr")
          .withDates(LocalDate.of(2025, 2, 1), LocalDate.of(2025, 7, 31))
          .persist();
      entityManager.flush();
      entityManager.clear();

      List<TermSummary> result =
          termService.findAllBySchoolYear(school.getId(), schoolYear.getId());

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(TermSummary::name)
          .containsExactlyInAnyOrder("1. Halbjahr", "2. Halbjahr");
    }

    @Test
    void doesNotReturnTermsFromOtherSchoolYear() {
      testData.term(schoolYear).withName("1. Halbjahr").persist();

      SchoolYear otherSchoolYear = testData.schoolYear(school).withName("2025/2026").persist();
      testData.term(otherSchoolYear).withName("Other Term").persist();
      entityManager.flush();
      entityManager.clear();

      List<TermSummary> result =
          termService.findAllBySchoolYear(school.getId(), schoolYear.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).name()).isEqualTo("1. Halbjahr");
    }

    @Test
    void returnsEmptyListWhenNoTerms() {
      entityManager.flush();
      entityManager.clear();

      List<TermSummary> result =
          termService.findAllBySchoolYear(school.getId(), schoolYear.getId());

      assertThat(result).isEmpty();
    }

    @Test
    void throwsWhenSchoolYearBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolYear otherSchoolYear = testData.schoolYear(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> termService.findAllBySchoolYear(school.getId(), otherSchoolYear.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("SchoolYear");
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsTermWhenFound() {
      Term term =
          testData
              .term(schoolYear)
              .withName("1. Halbjahr")
              .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31))
              .isCurrent(true)
              .persist();
      entityManager.flush();
      entityManager.clear();

      TermResponse result = termService.findById(school.getId(), schoolYear.getId(), term.getId());

      assertThat(result.id()).isEqualTo(term.getId());
      assertThat(result.name()).isEqualTo("1. Halbjahr");
      assertThat(result.startDate()).isEqualTo(LocalDate.of(2024, 8, 1));
      assertThat(result.endDate()).isEqualTo(LocalDate.of(2025, 1, 31));
      assertThat(result.isCurrent()).isTrue();
      assertThat(result.createdAt()).isNotNull();
      assertThat(result.updatedAt()).isNotNull();
    }

    @Test
    void throwsWhenTermNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(
              () -> termService.findById(school.getId(), schoolYear.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Term")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenTermBelongsToDifferentSchoolYear() {
      SchoolYear otherSchoolYear = testData.schoolYear(school).withName("2025/2026").persist();
      Term term = testData.term(otherSchoolYear).withName("Other Term").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> termService.findById(school.getId(), schoolYear.getId(), term.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsTermSuccessfully() {
      CreateTermRequest request =
          new CreateTermRequest(
              "1. Halbjahr", LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31), true);

      TermResponse result = termService.create(school.getId(), schoolYear.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.name()).isEqualTo("1. Halbjahr");
      assertThat(result.startDate()).isEqualTo(LocalDate.of(2024, 8, 1));
      assertThat(result.endDate()).isEqualTo(LocalDate.of(2025, 1, 31));
      assertThat(result.isCurrent()).isTrue();
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void createsTermWithDefaultIsCurrent() {
      CreateTermRequest request =
          new CreateTermRequest(
              "1. Halbjahr", LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31), null);

      TermResponse result = termService.create(school.getId(), schoolYear.getId(), request);

      assertThat(result.name()).isEqualTo("1. Halbjahr");
      assertThat(result.isCurrent()).isFalse();
    }

    @Test
    void throwsWhenSchoolYearNotFound() {
      UUID nonExistentSchoolYearId = UUID.randomUUID();
      CreateTermRequest request =
          new CreateTermRequest(
              "1. Halbjahr", LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31), null);

      assertThatThrownBy(() -> termService.create(school.getId(), nonExistentSchoolYearId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("SchoolYear");
    }

    @Test
    void throwsWhenSchoolYearBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolYear otherSchoolYear = testData.schoolYear(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      CreateTermRequest request =
          new CreateTermRequest(
              "1. Halbjahr", LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31), null);

      assertThatThrownBy(() -> termService.create(school.getId(), otherSchoolYear.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("SchoolYear");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      Term term =
          testData
              .term(schoolYear)
              .withName("1. Halbjahr")
              .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31))
              .isCurrent(false)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateTermRequest request =
          new UpdateTermRequest(
              "2. Halbjahr", LocalDate.of(2025, 2, 1), LocalDate.of(2025, 7, 31), true, null);

      TermResponse result =
          termService.update(school.getId(), schoolYear.getId(), term.getId(), request);

      assertThat(result.name()).isEqualTo("2. Halbjahr");
      assertThat(result.startDate()).isEqualTo(LocalDate.of(2025, 2, 1));
      assertThat(result.endDate()).isEqualTo(LocalDate.of(2025, 7, 31));
      assertThat(result.isCurrent()).isTrue();
    }

    @Test
    void updatesOnlyProvidedFields() {
      Term term =
          testData
              .term(schoolYear)
              .withName("1. Halbjahr")
              .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31))
              .isCurrent(false)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateTermRequest request = new UpdateTermRequest("Updated Name", null, null, null, null);

      TermResponse result =
          termService.update(school.getId(), schoolYear.getId(), term.getId(), request);

      assertThat(result.name()).isEqualTo("Updated Name");
      assertThat(result.startDate()).isEqualTo(LocalDate.of(2024, 8, 1)); // unchanged
      assertThat(result.endDate()).isEqualTo(LocalDate.of(2025, 1, 31)); // unchanged
      assertThat(result.isCurrent()).isFalse(); // unchanged
    }

    @Test
    void throwsWhenTermNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateTermRequest request = new UpdateTermRequest("Updated", null, null, null, null);

      assertThatThrownBy(
              () -> termService.update(school.getId(), schoolYear.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenTermBelongsToDifferentSchoolYear() {
      SchoolYear otherSchoolYear = testData.schoolYear(school).withName("2025/2026").persist();
      Term term = testData.term(otherSchoolYear).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateTermRequest request = new UpdateTermRequest("Updated", null, null, null, null);

      assertThatThrownBy(
              () -> termService.update(school.getId(), schoolYear.getId(), term.getId(), request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesTerm() {
      Term term = testData.term(schoolYear).persist();
      UUID termId = term.getId();
      entityManager.flush();
      entityManager.clear();

      termService.delete(school.getId(), schoolYear.getId(), termId);

      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> termService.findById(school.getId(), schoolYear.getId(), termId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenTermNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(
              () -> termService.delete(school.getId(), schoolYear.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenTermBelongsToDifferentSchoolYear() {
      SchoolYear otherSchoolYear = testData.schoolYear(school).withName("2025/2026").persist();
      Term term = testData.term(otherSchoolYear).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> termService.delete(school.getId(), schoolYear.getId(), term.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
