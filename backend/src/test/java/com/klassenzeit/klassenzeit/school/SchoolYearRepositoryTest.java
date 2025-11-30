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
class SchoolYearRepositoryTest extends AbstractIntegrationTest {

  @Autowired private SchoolYearRepository schoolYearRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Test
  void findBySchoolId_existingSchool_returnsYears() {
    testData.schoolYear(school).withName("2023/2024").persist();
    testData.schoolYear(school).withName("2024/2025").persist();

    School otherSchool = testData.school().withSlug("other").persist();
    testData.schoolYear(otherSchool).withName("2024/2025").persist();

    entityManager.flush();
    entityManager.clear();

    List<SchoolYear> found = schoolYearRepository.findBySchoolId(school.getId());

    assertThat(found).hasSize(2);
    assertThat(found)
        .extracting(SchoolYear::getName)
        .containsExactlyInAnyOrder("2023/2024", "2024/2025");
  }

  @Test
  void findBySchoolId_noYears_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    List<SchoolYear> found = schoolYearRepository.findBySchoolId(school.getId());

    assertThat(found).isEmpty();
  }

  @Test
  void findBySchoolIdAndIsCurrentTrue_currentYear_returnsYear() {
    testData.schoolYear(school).withName("2023/2024").isCurrent(false).persist();
    SchoolYear current =
        testData.schoolYear(school).withName("2024/2025").isCurrent(true).persist();
    entityManager.flush();
    entityManager.clear();

    Optional<SchoolYear> found =
        schoolYearRepository.findBySchoolIdAndIsCurrentTrue(school.getId());

    assertThat(found).isPresent();
    assertThat(found.get().getId()).isEqualTo(current.getId());
    assertThat(found.get().getName()).isEqualTo("2024/2025");
  }

  @Test
  void findBySchoolIdAndIsCurrentTrue_noCurrentYear_returnsEmpty() {
    testData.schoolYear(school).withName("2023/2024").isCurrent(false).persist();
    entityManager.flush();
    entityManager.clear();

    Optional<SchoolYear> found =
        schoolYearRepository.findBySchoolIdAndIsCurrentTrue(school.getId());

    assertThat(found).isEmpty();
  }

  @Test
  void findBySchoolIdOrderByStartDateDesc_multipleYears_returnsSorted() {
    testData
        .schoolYear(school)
        .withName("2022/2023")
        .withDates(LocalDate.of(2022, 8, 1), LocalDate.of(2023, 7, 31))
        .persist();
    testData
        .schoolYear(school)
        .withName("2024/2025")
        .withDates(LocalDate.of(2024, 8, 1), LocalDate.of(2025, 7, 31))
        .persist();
    testData
        .schoolYear(school)
        .withName("2023/2024")
        .withDates(LocalDate.of(2023, 8, 1), LocalDate.of(2024, 7, 31))
        .persist();
    entityManager.flush();
    entityManager.clear();

    List<SchoolYear> found =
        schoolYearRepository.findBySchoolIdOrderByStartDateDesc(school.getId());

    assertThat(found).hasSize(3);
    assertThat(found)
        .extracting(SchoolYear::getName)
        .containsExactly("2024/2025", "2023/2024", "2022/2023");
  }

  @Test
  void findBySchoolIdAndName_existingYear_returnsYear() {
    testData.schoolYear(school).withName("2024/2025").persist();
    entityManager.flush();
    entityManager.clear();

    Optional<SchoolYear> found =
        schoolYearRepository.findBySchoolIdAndName(school.getId(), "2024/2025");

    assertThat(found).isPresent();
    assertThat(found.get().getName()).isEqualTo("2024/2025");
  }

  @Test
  void findBySchoolIdAndName_nonExistentYear_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<SchoolYear> found =
        schoolYearRepository.findBySchoolIdAndName(school.getId(), "2024/2025");

    assertThat(found).isEmpty();
  }

  @Test
  void existsBySchoolIdAndName_existingYear_returnsTrue() {
    testData.schoolYear(school).withName("2024/2025").persist();
    entityManager.flush();

    boolean exists = schoolYearRepository.existsBySchoolIdAndName(school.getId(), "2024/2025");

    assertThat(exists).isTrue();
  }

  @Test
  void existsBySchoolIdAndName_nonExistentYear_returnsFalse() {
    entityManager.flush();

    boolean exists = schoolYearRepository.existsBySchoolIdAndName(school.getId(), "2024/2025");

    assertThat(exists).isFalse();
  }
}
