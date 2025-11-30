package com.klassenzeit.klassenzeit.school;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class SchoolRepositoryTest extends AbstractIntegrationTest {

  @Autowired private SchoolRepository schoolRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
  }

  @Test
  void findBySlug_existingSchool_returnsSchool() {
    School school = testData.school().withSlug("my-school").persist();
    entityManager.flush();
    entityManager.clear();

    Optional<School> found = schoolRepository.findBySlug("my-school");

    assertThat(found).isPresent();
    assertThat(found.get().getId()).isEqualTo(school.getId());
  }

  @Test
  void findBySlug_nonExistentSlug_returnsEmpty() {
    Optional<School> found = schoolRepository.findBySlug("non-existent");

    assertThat(found).isEmpty();
  }

  @Test
  void existsBySlug_existingSlug_returnsTrue() {
    testData.school().withSlug("existing-school").persist();
    entityManager.flush();

    boolean exists = schoolRepository.existsBySlug("existing-school");

    assertThat(exists).isTrue();
  }

  @Test
  void existsBySlug_nonExistentSlug_returnsFalse() {
    boolean exists = schoolRepository.existsBySlug("non-existent");

    assertThat(exists).isFalse();
  }

  @Test
  void findByNameContainingIgnoreCase_matchingName_returnsSchools() {
    testData.school().withName("Grundschule Berlin").withSlug("gs-berlin").persist();
    testData.school().withName("Grundschule Hamburg").withSlug("gs-hamburg").persist();
    testData.school().withName("Gymnasium München").withSlug("gym-munich").persist();
    entityManager.flush();
    entityManager.clear();

    List<School> found = schoolRepository.findByNameContainingIgnoreCase("grundschule");

    assertThat(found).hasSize(2);
    assertThat(found)
        .extracting(School::getName)
        .containsExactlyInAnyOrder("Grundschule Berlin", "Grundschule Hamburg");
  }

  @Test
  void findByNameContainingIgnoreCase_noMatch_returnsEmpty() {
    testData.school().withName("Grundschule Berlin").withSlug("gs-berlin").persist();
    entityManager.flush();
    entityManager.clear();

    List<School> found = schoolRepository.findByNameContainingIgnoreCase("realschule");

    assertThat(found).isEmpty();
  }

  @Test
  void findBySchoolType_matchingType_returnsSchools() {
    testData.school().withSchoolType("Grundschule").withSlug("gs1").persist();
    testData.school().withSchoolType("Grundschule").withSlug("gs2").persist();
    testData.school().withSchoolType("Gymnasium").withSlug("gym1").persist();
    entityManager.flush();
    entityManager.clear();

    List<School> found = schoolRepository.findBySchoolType("Grundschule");

    assertThat(found).hasSize(2);
    assertThat(found).extracting(School::getSchoolType).containsOnly("Grundschule");
  }

  @Test
  void findBySchoolType_noMatch_returnsEmpty() {
    testData.school().withSchoolType("Grundschule").withSlug("gs1").persist();
    entityManager.flush();
    entityManager.clear();

    List<School> found = schoolRepository.findBySchoolType("Realschule");

    assertThat(found).isEmpty();
  }
}
