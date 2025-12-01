package com.klassenzeit.klassenzeit.teacher;

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
class TeacherRepositoryTest extends AbstractIntegrationTest {

  @Autowired private TeacherRepository teacherRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Test
  void findBySchoolId_existingSchool_returnsTeachers() {
    testData.teacher(school).withAbbreviation("MUE").persist();
    testData.teacher(school).withAbbreviation("SCH").persist();

    School otherSchool = testData.school().withSlug("other").persist();
    testData.teacher(otherSchool).withAbbreviation("KRA").persist();

    entityManager.flush();
    entityManager.clear();

    List<Teacher> found = teacherRepository.findBySchoolId(school.getId());

    assertThat(found).hasSize(2);
    assertThat(found).extracting(Teacher::getAbbreviation).containsExactlyInAnyOrder("MUE", "SCH");
  }

  @Test
  void findBySchoolIdAndIsActiveTrue_mixedTeachers_returnsOnlyActive() {
    testData.teacher(school).withAbbreviation("ACT").isActive(true).persist();
    testData.teacher(school).withAbbreviation("INA").isActive(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<Teacher> found = teacherRepository.findBySchoolIdAndIsActiveTrue(school.getId());

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getAbbreviation()).isEqualTo("ACT");
  }

  @Test
  void findBySchoolIdAndIsActiveFalse_mixedTeachers_returnsOnlyInactive() {
    testData.teacher(school).withAbbreviation("ACT").isActive(true).persist();
    testData.teacher(school).withAbbreviation("INA").isActive(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<Teacher> found = teacherRepository.findBySchoolIdAndIsActiveFalse(school.getId());

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getAbbreviation()).isEqualTo("INA");
  }

  @Test
  void findBySchoolIdAndAbbreviation_existingTeacher_returnsTeacher() {
    testData.teacher(school).withAbbreviation("MUE").persist();
    entityManager.flush();
    entityManager.clear();

    Optional<Teacher> found =
        teacherRepository.findBySchoolIdAndAbbreviation(school.getId(), "MUE");

    assertThat(found).isPresent();
    assertThat(found.get().getAbbreviation()).isEqualTo("MUE");
  }

  @Test
  void findBySchoolIdAndAbbreviation_nonExistentTeacher_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<Teacher> found =
        teacherRepository.findBySchoolIdAndAbbreviation(school.getId(), "MUE");

    assertThat(found).isEmpty();
  }

  @Test
  void existsBySchoolIdAndAbbreviation_existingTeacher_returnsTrue() {
    testData.teacher(school).withAbbreviation("MUE").persist();
    entityManager.flush();

    boolean exists = teacherRepository.existsBySchoolIdAndAbbreviation(school.getId(), "MUE");

    assertThat(exists).isTrue();
  }

  @Test
  void existsBySchoolIdAndAbbreviation_nonExistentTeacher_returnsFalse() {
    entityManager.flush();

    boolean exists = teacherRepository.existsBySchoolIdAndAbbreviation(school.getId(), "MUE");

    assertThat(exists).isFalse();
  }

  @Test
  void findBySchoolIdAndLastNameContainingIgnoreCase_partialMatch_returnsTeachers() {
    testData.teacher(school).withLastName("Müller").withAbbreviation("MUE").persist();
    testData.teacher(school).withLastName("Schmidtmüller").withAbbreviation("SMU").persist();
    testData.teacher(school).withLastName("Schmidt").withAbbreviation("SCH").persist();
    entityManager.flush();
    entityManager.clear();

    List<Teacher> found =
        teacherRepository.findBySchoolIdAndLastNameContainingIgnoreCase(school.getId(), "müller");

    assertThat(found).hasSize(2);
    assertThat(found)
        .extracting(Teacher::getLastName)
        .containsExactlyInAnyOrder("Müller", "Schmidtmüller");
  }

  @Test
  void
      findBySchoolIdAndFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase_search_returnsMatches() {
    testData
        .teacher(school)
        .withFirstName("Anna")
        .withLastName("Müller")
        .withAbbreviation("MUE")
        .persist();
    testData
        .teacher(school)
        .withFirstName("Thomas")
        .withLastName("Bauer")
        .withAbbreviation("BAU")
        .persist();
    testData
        .teacher(school)
        .withFirstName("Annabelle")
        .withLastName("Schmidt")
        .withAbbreviation("SCH")
        .persist();
    entityManager.flush();
    entityManager.clear();

    List<Teacher> found =
        teacherRepository
            .findBySchoolIdAndFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(
                school.getId(), "anna", "anna");

    assertThat(found).hasSize(2);
    assertThat(found).extracting(Teacher::getAbbreviation).containsExactlyInAnyOrder("MUE", "SCH");
  }

  @Test
  void findBySchoolIdAndEmail_existingEmail_returnsTeacher() {
    testData.teacher(school).withEmail("mueller@schule.de").withAbbreviation("MUE").persist();
    entityManager.flush();
    entityManager.clear();

    Optional<Teacher> found =
        teacherRepository.findBySchoolIdAndEmail(school.getId(), "mueller@schule.de");

    assertThat(found).isPresent();
    assertThat(found.get().getAbbreviation()).isEqualTo("MUE");
  }

  @Test
  void findBySchoolIdAndEmail_nonExistentEmail_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<Teacher> found =
        teacherRepository.findBySchoolIdAndEmail(school.getId(), "nobody@schule.de");

    assertThat(found).isEmpty();
  }

  @Test
  void
      findBySchoolIdAndIsActiveTrueOrderByLastNameAscFirstNameAsc_multipleTeachers_returnsSorted() {
    testData
        .teacher(school)
        .withFirstName("Bernd")
        .withLastName("Müller")
        .withAbbreviation("MUB")
        .isActive(true)
        .persist();
    testData
        .teacher(school)
        .withFirstName("Anna")
        .withLastName("Müller")
        .withAbbreviation("MUA")
        .isActive(true)
        .persist();
    testData
        .teacher(school)
        .withFirstName("Klaus")
        .withLastName("Bauer")
        .withAbbreviation("BAU")
        .isActive(true)
        .persist();
    testData
        .teacher(school)
        .withFirstName("Inactive")
        .withLastName("Teacher")
        .withAbbreviation("INA")
        .isActive(false)
        .persist();
    entityManager.flush();
    entityManager.clear();

    List<Teacher> found =
        teacherRepository.findBySchoolIdAndIsActiveTrueOrderByLastNameAscFirstNameAsc(
            school.getId());

    assertThat(found).hasSize(3);
    assertThat(found).extracting(Teacher::getAbbreviation).containsExactly("BAU", "MUA", "MUB");
  }
}
