package com.klassenzeit.klassenzeit.subject;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.school.School;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class SubjectRepositoryTest extends AbstractIntegrationTest {

  @Autowired private SubjectRepository subjectRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Test
  void findBySchoolId_existingSchool_returnsSubjects() {
    testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
    testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();

    School otherSchool = testData.school().withSlug("other").persist();
    testData.subject(otherSchool).withName("Englisch").withAbbreviation("EN").persist();

    entityManager.flush();
    entityManager.clear();

    List<Subject> found = subjectRepository.findBySchoolId(school.getId());

    assertThat(found).hasSize(2);
    assertThat(found)
        .extracting(Subject::getName)
        .containsExactlyInAnyOrder("Mathematik", "Deutsch");
  }

  @Test
  void findBySchoolId_noSubjects_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    List<Subject> found = subjectRepository.findBySchoolId(school.getId());

    assertThat(found).isEmpty();
  }

  @Test
  void findBySchoolIdAndAbbreviation_existingSubject_returnsSubject() {
    testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
    entityManager.flush();
    entityManager.clear();

    Optional<Subject> found = subjectRepository.findBySchoolIdAndAbbreviation(school.getId(), "MA");

    assertThat(found).isPresent();
    assertThat(found.get().getName()).isEqualTo("Mathematik");
  }

  @Test
  void findBySchoolIdAndAbbreviation_nonExistentSubject_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<Subject> found = subjectRepository.findBySchoolIdAndAbbreviation(school.getId(), "MA");

    assertThat(found).isEmpty();
  }

  @Test
  void existsBySchoolIdAndAbbreviation_existingSubject_returnsTrue() {
    testData.subject(school).withAbbreviation("MA").persist();
    entityManager.flush();

    boolean exists = subjectRepository.existsBySchoolIdAndAbbreviation(school.getId(), "MA");

    assertThat(exists).isTrue();
  }

  @Test
  void existsBySchoolIdAndAbbreviation_nonExistentSubject_returnsFalse() {
    entityManager.flush();

    boolean exists = subjectRepository.existsBySchoolIdAndAbbreviation(school.getId(), "MA");

    assertThat(exists).isFalse();
  }

  @Test
  void findBySchoolIdOrderByNameAsc_multipleSubjects_returnsSorted() {
    testData.subject(school).withName("Sachkunde").withAbbreviation("SK").persist();
    testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();
    testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
    entityManager.flush();
    entityManager.clear();

    List<Subject> found = subjectRepository.findBySchoolIdOrderByNameAsc(school.getId());

    assertThat(found).hasSize(3);
    assertThat(found)
        .extracting(Subject::getName)
        .containsExactly("Deutsch", "Mathematik", "Sachkunde");
  }

  @Test
  void findBySchoolIdAndNameContainingIgnoreCase_partialMatch_returnsSubjects() {
    testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
    testData.subject(school).withName("Wirtschaftsmathematik").withAbbreviation("WM").persist();
    testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();
    entityManager.flush();
    entityManager.clear();

    List<Subject> found =
        subjectRepository.findBySchoolIdAndNameContainingIgnoreCase(school.getId(), "mathematik");

    assertThat(found).hasSize(2);
    assertThat(found)
        .extracting(Subject::getName)
        .containsExactlyInAnyOrder("Mathematik", "Wirtschaftsmathematik");
  }

  @Test
  void findBySchoolIdAndNameContainingIgnoreCase_noMatch_returnsEmpty() {
    testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
    entityManager.flush();
    entityManager.clear();

    List<Subject> found =
        subjectRepository.findBySchoolIdAndNameContainingIgnoreCase(school.getId(), "physik");

    assertThat(found).isEmpty();
  }
}
