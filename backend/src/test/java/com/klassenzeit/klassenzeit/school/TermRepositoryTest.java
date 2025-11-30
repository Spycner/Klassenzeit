package com.klassenzeit.klassenzeit.school;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TermRepositoryTest extends AbstractIntegrationTest {

  @Autowired private TermRepository termRepository;
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

  @Test
  void findBySchoolYearId_existingYear_returnsTerms() {
    testData.term(schoolYear).withName("1. Halbjahr").persist();
    testData.term(schoolYear).withName("2. Halbjahr").persist();

    SchoolYear otherYear = testData.schoolYear(school).withName("2023/2024").persist();
    testData.term(otherYear).withName("1. Halbjahr").persist();

    entityManager.flush();
    entityManager.clear();

    List<Term> found = termRepository.findBySchoolYearId(schoolYear.getId());

    assertThat(found).hasSize(2);
    assertThat(found)
        .extracting(Term::getName)
        .containsExactlyInAnyOrder("1. Halbjahr", "2. Halbjahr");
  }

  @Test
  void findBySchoolYearId_noTerms_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    List<Term> found = termRepository.findBySchoolYearId(schoolYear.getId());

    assertThat(found).isEmpty();
  }

  @Test
  void findBySchoolYearIdAndIsCurrentTrue_currentTerm_returnsTerm() {
    testData.term(schoolYear).withName("1. Halbjahr").isCurrent(false).persist();
    Term current = testData.term(schoolYear).withName("2. Halbjahr").isCurrent(true).persist();
    entityManager.flush();
    entityManager.clear();

    Optional<Term> found = termRepository.findBySchoolYearIdAndIsCurrentTrue(schoolYear.getId());

    assertThat(found).isPresent();
    assertThat(found.get().getId()).isEqualTo(current.getId());
    assertThat(found.get().getName()).isEqualTo("2. Halbjahr");
  }

  @Test
  void findBySchoolYearIdAndIsCurrentTrue_noCurrentTerm_returnsEmpty() {
    testData.term(schoolYear).withName("1. Halbjahr").isCurrent(false).persist();
    entityManager.flush();
    entityManager.clear();

    Optional<Term> found = termRepository.findBySchoolYearIdAndIsCurrentTrue(schoolYear.getId());

    assertThat(found).isEmpty();
  }

  @Test
  void findBySchoolYearIdOrderByStartDateAsc_multipleTerms_returnsSorted() {
    testData
        .term(schoolYear)
        .withName("2. Halbjahr")
        .withDates(LocalDate.of(2025, 2, 1), LocalDate.of(2025, 7, 31))
        .persist();
    testData
        .term(schoolYear)
        .withName("1. Halbjahr")
        .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 1, 31))
        .persist();
    entityManager.flush();
    entityManager.clear();

    List<Term> found = termRepository.findBySchoolYearIdOrderByStartDateAsc(schoolYear.getId());

    assertThat(found).hasSize(2);
    assertThat(found).extracting(Term::getName).containsExactly("1. Halbjahr", "2. Halbjahr");
  }

  @Test
  void findBySchoolYearIdAndName_existingTerm_returnsTerm() {
    testData.term(schoolYear).withName("1. Halbjahr").persist();
    entityManager.flush();
    entityManager.clear();

    Optional<Term> found =
        termRepository.findBySchoolYearIdAndName(schoolYear.getId(), "1. Halbjahr");

    assertThat(found).isPresent();
    assertThat(found.get().getName()).isEqualTo("1. Halbjahr");
  }

  @Test
  void findBySchoolYearIdAndName_nonExistentTerm_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<Term> found = termRepository.findBySchoolYearIdAndName(schoolYear.getId(), "Q1");

    assertThat(found).isEmpty();
  }

  @Test
  void existsBySchoolYearIdAndName_existingTerm_returnsTrue() {
    testData.term(schoolYear).withName("1. Halbjahr").persist();
    entityManager.flush();

    boolean exists = termRepository.existsBySchoolYearIdAndName(schoolYear.getId(), "1. Halbjahr");

    assertThat(exists).isTrue();
  }

  @Test
  void existsBySchoolYearIdAndName_nonExistentTerm_returnsFalse() {
    entityManager.flush();

    boolean exists = termRepository.existsBySchoolYearIdAndName(schoolYear.getId(), "Q1");

    assertThat(exists).isFalse();
  }
}
