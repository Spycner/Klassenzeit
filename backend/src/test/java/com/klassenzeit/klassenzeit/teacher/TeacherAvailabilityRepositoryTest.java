package com.klassenzeit.klassenzeit.teacher;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.AvailabilityType;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolYear;
import com.klassenzeit.klassenzeit.school.Term;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TeacherAvailabilityRepositoryTest extends AbstractIntegrationTest {

  @Autowired private TeacherAvailabilityRepository availabilityRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private Teacher teacher;
  private Term term;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    teacher = testData.teacher(school).withAbbreviation("MUE").persist();
    SchoolYear schoolYear = testData.schoolYear(school).persist();
    term = testData.term(schoolYear).persist();
  }

  @Test
  void findByTeacherId_existingTeacher_returnsAvailabilities() {
    testData.availability(teacher).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
    testData.availability(teacher).withDayOfWeek((short) 0).withPeriod((short) 2).persist();

    Teacher otherTeacher = testData.teacher(school).withAbbreviation("SCH").persist();
    testData.availability(otherTeacher).withDayOfWeek((short) 0).withPeriod((short) 1).persist();

    entityManager.flush();
    entityManager.clear();

    List<TeacherAvailability> found = availabilityRepository.findByTeacherId(teacher.getId());

    assertThat(found).hasSize(2);
  }

  @Test
  void findByTeacherId_noAvailabilities_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    List<TeacherAvailability> found = availabilityRepository.findByTeacherId(teacher.getId());

    assertThat(found).isEmpty();
  }

  @Test
  void findByTeacherIdAndTermId_specificTerm_returnsTermAvailabilities() {
    testData.availability(teacher).withTerm(term).withDayOfWeek((short) 0).persist();
    testData.availability(teacher).global().withDayOfWeek((short) 1).persist();
    entityManager.flush();
    entityManager.clear();

    List<TeacherAvailability> found =
        availabilityRepository.findByTeacherIdAndTermId(teacher.getId(), term.getId());

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getDayOfWeek()).isEqualTo((short) 0);
  }

  @Test
  void findByTeacherIdAndTermIsNull_globalAvailability_returnsGlobal() {
    testData.availability(teacher).withTerm(term).withDayOfWeek((short) 0).persist();
    testData.availability(teacher).global().withDayOfWeek((short) 1).persist();
    testData.availability(teacher).global().withDayOfWeek((short) 2).persist();
    entityManager.flush();
    entityManager.clear();

    List<TeacherAvailability> found =
        availabilityRepository.findByTeacherIdAndTermIsNull(teacher.getId());

    assertThat(found).hasSize(2);
    assertThat(found).allMatch(TeacherAvailability::isGlobal);
  }

  @Test
  void findByTeacherIdAndAvailabilityType_blockedType_returnsBlocked() {
    testData
        .availability(teacher)
        .withType(AvailabilityType.BLOCKED)
        .withDayOfWeek((short) 0)
        .persist();
    testData
        .availability(teacher)
        .withType(AvailabilityType.PREFERRED)
        .withDayOfWeek((short) 1)
        .persist();
    entityManager.flush();
    entityManager.clear();

    List<TeacherAvailability> found =
        availabilityRepository.findByTeacherIdAndAvailabilityType(
            teacher.getId(), AvailabilityType.BLOCKED);

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getAvailabilityType()).isEqualTo(AvailabilityType.BLOCKED);
  }

  @Test
  void findByTeacherIdAndTermIdAndDayOfWeekAndPeriod_specificSlot_returnsAvailability() {
    testData
        .availability(teacher)
        .withTerm(term)
        .withDayOfWeek((short) 0)
        .withPeriod((short) 1)
        .withType(AvailabilityType.BLOCKED)
        .persist();
    entityManager.flush();
    entityManager.clear();

    Optional<TeacherAvailability> found =
        availabilityRepository.findByTeacherIdAndTermIdAndDayOfWeekAndPeriod(
            teacher.getId(), term.getId(), (short) 0, (short) 1);

    assertThat(found).isPresent();
    assertThat(found.get().getAvailabilityType()).isEqualTo(AvailabilityType.BLOCKED);
  }

  @Test
  void findByTeacherIdAndTermIdAndDayOfWeekAndPeriod_nonExistent_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<TeacherAvailability> found =
        availabilityRepository.findByTeacherIdAndTermIdAndDayOfWeekAndPeriod(
            teacher.getId(), term.getId(), (short) 0, (short) 1);

    assertThat(found).isEmpty();
  }

  @Test
  void findByTeacherIdAndDayOfWeek_monday_returnsMondayAvailabilities() {
    testData.availability(teacher).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
    testData.availability(teacher).withDayOfWeek((short) 0).withPeriod((short) 2).persist();
    testData.availability(teacher).withDayOfWeek((short) 1).withPeriod((short) 1).persist();
    entityManager.flush();
    entityManager.clear();

    List<TeacherAvailability> found =
        availabilityRepository.findByTeacherIdAndDayOfWeek(teacher.getId(), (short) 0);

    assertThat(found).hasSize(2);
    assertThat(found).allMatch(a -> a.getDayOfWeek() == 0);
  }

  @Test
  void deleteByTeacherIdAndTermId_existingAvailabilities_deletesAll() {
    testData.availability(teacher).withTerm(term).withDayOfWeek((short) 0).persist();
    testData.availability(teacher).withTerm(term).withDayOfWeek((short) 1).persist();
    testData.availability(teacher).global().withDayOfWeek((short) 2).persist();
    entityManager.flush();
    entityManager.clear();

    availabilityRepository.deleteByTeacherIdAndTermId(teacher.getId(), term.getId());
    entityManager.flush();
    entityManager.clear();

    List<TeacherAvailability> remaining = availabilityRepository.findByTeacherId(teacher.getId());
    assertThat(remaining).hasSize(1);
    assertThat(remaining.get(0).isGlobal()).isTrue();
  }
}
