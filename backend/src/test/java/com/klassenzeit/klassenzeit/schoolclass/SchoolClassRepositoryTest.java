package com.klassenzeit.klassenzeit.schoolclass;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class SchoolClassRepositoryTest extends AbstractIntegrationTest {

  @Autowired private SchoolClassRepository schoolClassRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Test
  void findBySchoolId_existingSchool_returnsClasses() {
    testData.schoolClass(school).withName("1a").persist();
    testData.schoolClass(school).withName("2a").persist();

    School otherSchool = testData.school().withSlug("other").persist();
    testData.schoolClass(otherSchool).withName("1a").persist();

    entityManager.flush();
    entityManager.clear();

    List<SchoolClass> found = schoolClassRepository.findBySchoolId(school.getId());

    assertThat(found).hasSize(2);
    assertThat(found).extracting(SchoolClass::getName).containsExactlyInAnyOrder("1a", "2a");
  }

  @Test
  void findBySchoolIdAndIsActiveTrue_mixedClasses_returnsOnlyActive() {
    testData.schoolClass(school).withName("Active").isActive(true).persist();
    testData.schoolClass(school).withName("Inactive").isActive(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<SchoolClass> found = schoolClassRepository.findBySchoolIdAndIsActiveTrue(school.getId());

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getName()).isEqualTo("Active");
  }

  @Test
  void findBySchoolIdAndIsActiveFalse_mixedClasses_returnsOnlyInactive() {
    testData.schoolClass(school).withName("Active").isActive(true).persist();
    testData.schoolClass(school).withName("Inactive").isActive(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<SchoolClass> found = schoolClassRepository.findBySchoolIdAndIsActiveFalse(school.getId());

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getName()).isEqualTo("Inactive");
  }

  @Test
  void findBySchoolIdAndGradeLevel_grade3_returnsGrade3Classes() {
    testData.schoolClass(school).withName("3a").withGradeLevel((short) 3).persist();
    testData.schoolClass(school).withName("3b").withGradeLevel((short) 3).persist();
    testData.schoolClass(school).withName("4a").withGradeLevel((short) 4).persist();
    entityManager.flush();
    entityManager.clear();

    List<SchoolClass> found =
        schoolClassRepository.findBySchoolIdAndGradeLevel(school.getId(), (short) 3);

    assertThat(found).hasSize(2);
    assertThat(found).extracting(SchoolClass::getName).containsExactlyInAnyOrder("3a", "3b");
  }

  @Test
  void findBySchoolIdAndName_existingClass_returnsClass() {
    testData.schoolClass(school).withName("3a").persist();
    entityManager.flush();
    entityManager.clear();

    Optional<SchoolClass> found = schoolClassRepository.findBySchoolIdAndName(school.getId(), "3a");

    assertThat(found).isPresent();
    assertThat(found.get().getName()).isEqualTo("3a");
  }

  @Test
  void findBySchoolIdAndName_nonExistentClass_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<SchoolClass> found = schoolClassRepository.findBySchoolIdAndName(school.getId(), "3a");

    assertThat(found).isEmpty();
  }

  @Test
  void existsBySchoolIdAndName_existingClass_returnsTrue() {
    testData.schoolClass(school).withName("3a").persist();
    entityManager.flush();

    boolean exists = schoolClassRepository.existsBySchoolIdAndName(school.getId(), "3a");

    assertThat(exists).isTrue();
  }

  @Test
  void existsBySchoolIdAndName_nonExistentClass_returnsFalse() {
    entityManager.flush();

    boolean exists = schoolClassRepository.existsBySchoolIdAndName(school.getId(), "3a");

    assertThat(exists).isFalse();
  }

  @Test
  void findByClassTeacherId_assignedTeacher_returnsClasses() {
    Teacher teacher = testData.teacher(school).withAbbreviation("MUE").persist();
    Teacher otherTeacher = testData.teacher(school).withAbbreviation("SCH").persist();

    testData.schoolClass(school).withName("3a").withClassTeacher(teacher).persist();
    testData.schoolClass(school).withName("4a").withClassTeacher(teacher).persist();
    testData.schoolClass(school).withName("3b").withClassTeacher(otherTeacher).persist();
    entityManager.flush();
    entityManager.clear();

    List<SchoolClass> found = schoolClassRepository.findByClassTeacherId(teacher.getId());

    assertThat(found).hasSize(2);
    assertThat(found).extracting(SchoolClass::getName).containsExactlyInAnyOrder("3a", "4a");
  }

  @Test
  void findBySchoolIdAndIsActiveTrueOrderByGradeLevelAscNameAsc_multipleClasses_returnsSorted() {
    testData.schoolClass(school).withName("3b").withGradeLevel((short) 3).isActive(true).persist();
    testData.schoolClass(school).withName("3a").withGradeLevel((short) 3).isActive(true).persist();
    testData.schoolClass(school).withName("1a").withGradeLevel((short) 1).isActive(true).persist();
    testData.schoolClass(school).withName("2a").withGradeLevel((short) 2).isActive(true).persist();
    testData
        .schoolClass(school)
        .withName("Inactive")
        .withGradeLevel((short) 1)
        .isActive(false)
        .persist();
    entityManager.flush();
    entityManager.clear();

    List<SchoolClass> found =
        schoolClassRepository.findBySchoolIdAndIsActiveTrueOrderByGradeLevelAscNameAsc(
            school.getId());

    assertThat(found).hasSize(4);
    assertThat(found).extracting(SchoolClass::getName).containsExactly("1a", "2a", "3a", "3b");
  }

  @Test
  void findBySchoolIdAndStudentCountGreaterThan_minCount_returnsLargeClasses() {
    testData.schoolClass(school).withName("Small").withStudentCount(20).persist();
    testData.schoolClass(school).withName("Medium").withStudentCount(25).persist();
    testData.schoolClass(school).withName("Large").withStudentCount(30).persist();
    entityManager.flush();
    entityManager.clear();

    List<SchoolClass> found =
        schoolClassRepository.findBySchoolIdAndStudentCountGreaterThan(school.getId(), 24);

    assertThat(found).hasSize(2);
    assertThat(found).extracting(SchoolClass::getName).containsExactlyInAnyOrder("Medium", "Large");
  }
}
