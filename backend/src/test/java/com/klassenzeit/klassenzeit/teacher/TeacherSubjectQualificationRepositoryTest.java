package com.klassenzeit.klassenzeit.teacher;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.QualificationLevel;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.subject.Subject;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TeacherSubjectQualificationRepositoryTest extends AbstractIntegrationTest {

  @Autowired private TeacherSubjectQualificationRepository qualificationRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private Teacher teacher;
  private Subject math;
  private Subject german;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    teacher = testData.teacher(school).withAbbreviation("MUE").persist();
    math = testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
    german = testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();
  }

  @Test
  void findByTeacherId_existingTeacher_returnsQualifications() {
    testData.qualification(teacher, math).persist();
    testData.qualification(teacher, german).persist();

    Teacher otherTeacher = testData.teacher(school).withAbbreviation("SCH").persist();
    testData.qualification(otherTeacher, math).persist();

    entityManager.flush();
    entityManager.clear();

    List<TeacherSubjectQualification> found =
        qualificationRepository.findByTeacherId(teacher.getId());

    assertThat(found).hasSize(2);
  }

  @Test
  void findByTeacherId_noQualifications_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    List<TeacherSubjectQualification> found =
        qualificationRepository.findByTeacherId(teacher.getId());

    assertThat(found).isEmpty();
  }

  @Test
  void findBySubjectId_existingSubject_returnsQualifications() {
    testData.qualification(teacher, math).persist();

    Teacher otherTeacher = testData.teacher(school).withAbbreviation("SCH").persist();
    testData.qualification(otherTeacher, math).persist();
    testData.qualification(otherTeacher, german).persist();

    entityManager.flush();
    entityManager.clear();

    List<TeacherSubjectQualification> found = qualificationRepository.findBySubjectId(math.getId());

    assertThat(found).hasSize(2);
  }

  @Test
  void findByTeacherIdAndSubjectId_existingQualification_returnsQualification() {
    testData.qualification(teacher, math).withLevel(QualificationLevel.PRIMARY).persist();
    entityManager.flush();
    entityManager.clear();

    Optional<TeacherSubjectQualification> found =
        qualificationRepository.findByTeacherIdAndSubjectId(teacher.getId(), math.getId());

    assertThat(found).isPresent();
    assertThat(found.get().getQualificationLevel()).isEqualTo(QualificationLevel.PRIMARY);
  }

  @Test
  void findByTeacherIdAndSubjectId_nonExistentQualification_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<TeacherSubjectQualification> found =
        qualificationRepository.findByTeacherIdAndSubjectId(teacher.getId(), math.getId());

    assertThat(found).isEmpty();
  }

  @Test
  void existsByTeacherIdAndSubjectId_existingQualification_returnsTrue() {
    testData.qualification(teacher, math).persist();
    entityManager.flush();

    boolean exists =
        qualificationRepository.existsByTeacherIdAndSubjectId(teacher.getId(), math.getId());

    assertThat(exists).isTrue();
  }

  @Test
  void existsByTeacherIdAndSubjectId_nonExistentQualification_returnsFalse() {
    entityManager.flush();

    boolean exists =
        qualificationRepository.existsByTeacherIdAndSubjectId(teacher.getId(), math.getId());

    assertThat(exists).isFalse();
  }

  @Test
  void findByTeacherIdAndQualificationLevel_primaryLevel_returnsPrimary() {
    testData.qualification(teacher, math).withLevel(QualificationLevel.PRIMARY).persist();
    testData.qualification(teacher, german).withLevel(QualificationLevel.SECONDARY).persist();
    entityManager.flush();
    entityManager.clear();

    List<TeacherSubjectQualification> found =
        qualificationRepository.findByTeacherIdAndQualificationLevel(
            teacher.getId(), QualificationLevel.PRIMARY);

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getQualificationLevel()).isEqualTo(QualificationLevel.PRIMARY);
  }

  @Test
  void deleteByTeacherIdAndSubjectId_existingQualification_deletesIt() {
    testData.qualification(teacher, math).persist();
    testData.qualification(teacher, german).persist();
    entityManager.flush();
    entityManager.clear();

    qualificationRepository.deleteByTeacherIdAndSubjectId(teacher.getId(), math.getId());
    entityManager.flush();
    entityManager.clear();

    List<TeacherSubjectQualification> remaining =
        qualificationRepository.findByTeacherId(teacher.getId());
    assertThat(remaining).hasSize(1);

    Optional<TeacherSubjectQualification> deleted =
        qualificationRepository.findByTeacherIdAndSubjectId(teacher.getId(), math.getId());
    assertThat(deleted).isEmpty();
  }
}
