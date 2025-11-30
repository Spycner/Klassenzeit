package com.klassenzeit.klassenzeit.timeslot;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.school.School;
import jakarta.persistence.EntityManager;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TimeSlotRepositoryTest extends AbstractIntegrationTest {

  @Autowired private TimeSlotRepository timeSlotRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Test
  void findBySchoolId_existingSchool_returnsTimeSlots() {
    testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
    testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 2).persist();

    School otherSchool = testData.school().withSlug("other").persist();
    testData.timeSlot(otherSchool).withDayOfWeek((short) 0).withPeriod((short) 1).persist();

    entityManager.flush();
    entityManager.clear();

    List<TimeSlot> found = timeSlotRepository.findBySchoolId(school.getId());

    assertThat(found).hasSize(2);
  }

  @Test
  void findBySchoolIdAndIsBreakFalse_mixedSlots_returnsOnlyTeachingSlots() {
    testData.timeSlot(school).withPeriod((short) 1).isBreak(false).persist();
    testData.timeSlot(school).withPeriod((short) 2).isBreak(true).persist();
    testData.timeSlot(school).withPeriod((short) 3).isBreak(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<TimeSlot> found = timeSlotRepository.findBySchoolIdAndIsBreakFalse(school.getId());

    assertThat(found).hasSize(2);
    assertThat(found).noneMatch(TimeSlot::isBreak);
  }

  @Test
  void findBySchoolIdAndIsBreakTrue_mixedSlots_returnsOnlyBreaks() {
    testData.timeSlot(school).withPeriod((short) 1).isBreak(false).persist();
    testData.timeSlot(school).withPeriod((short) 2).isBreak(true).persist();
    testData.timeSlot(school).withPeriod((short) 3).isBreak(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<TimeSlot> found = timeSlotRepository.findBySchoolIdAndIsBreakTrue(school.getId());

    assertThat(found).hasSize(1);
    assertThat(found).allMatch(TimeSlot::isBreak);
  }

  @Test
  void findBySchoolIdOrderByDayOfWeekAscPeriodAsc_multipleSlots_returnsSorted() {
    testData.timeSlot(school).withDayOfWeek((short) 1).withPeriod((short) 2).persist();
    testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 2).persist();
    testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
    testData.timeSlot(school).withDayOfWeek((short) 1).withPeriod((short) 1).persist();
    entityManager.flush();
    entityManager.clear();

    List<TimeSlot> found =
        timeSlotRepository.findBySchoolIdOrderByDayOfWeekAscPeriodAsc(school.getId());

    assertThat(found).hasSize(4);
    assertThat(found.get(0).getDayOfWeek()).isEqualTo((short) 0);
    assertThat(found.get(0).getPeriod()).isEqualTo((short) 1);
    assertThat(found.get(1).getDayOfWeek()).isEqualTo((short) 0);
    assertThat(found.get(1).getPeriod()).isEqualTo((short) 2);
    assertThat(found.get(2).getDayOfWeek()).isEqualTo((short) 1);
    assertThat(found.get(2).getPeriod()).isEqualTo((short) 1);
  }

  @Test
  void findBySchoolIdAndDayOfWeekAndPeriod_specificSlot_returnsSlot() {
    testData
        .timeSlot(school)
        .withDayOfWeek((short) 0)
        .withPeriod((short) 1)
        .withTimes(LocalTime.of(8, 0), LocalTime.of(8, 45))
        .persist();
    entityManager.flush();
    entityManager.clear();

    Optional<TimeSlot> found =
        timeSlotRepository.findBySchoolIdAndDayOfWeekAndPeriod(
            school.getId(), (short) 0, (short) 1);

    assertThat(found).isPresent();
    assertThat(found.get().getStartTime()).isEqualTo(LocalTime.of(8, 0));
  }

  @Test
  void findBySchoolIdAndDayOfWeekAndPeriod_nonExistent_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<TimeSlot> found =
        timeSlotRepository.findBySchoolIdAndDayOfWeekAndPeriod(
            school.getId(), (short) 0, (short) 1);

    assertThat(found).isEmpty();
  }

  @Test
  void existsBySchoolIdAndDayOfWeekAndPeriod_existingSlot_returnsTrue() {
    testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
    entityManager.flush();

    boolean exists =
        timeSlotRepository.existsBySchoolIdAndDayOfWeekAndPeriod(
            school.getId(), (short) 0, (short) 1);

    assertThat(exists).isTrue();
  }

  @Test
  void existsBySchoolIdAndDayOfWeekAndPeriod_nonExistentSlot_returnsFalse() {
    entityManager.flush();

    boolean exists =
        timeSlotRepository.existsBySchoolIdAndDayOfWeekAndPeriod(
            school.getId(), (short) 0, (short) 1);

    assertThat(exists).isFalse();
  }

  @Test
  void findBySchoolIdAndDayOfWeekOrderByPeriodAsc_monday_returnsMondaySorted() {
    testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 3).persist();
    testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
    testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 2).persist();
    testData.timeSlot(school).withDayOfWeek((short) 1).withPeriod((short) 1).persist();
    entityManager.flush();
    entityManager.clear();

    List<TimeSlot> found =
        timeSlotRepository.findBySchoolIdAndDayOfWeekOrderByPeriodAsc(school.getId(), (short) 0);

    assertThat(found).hasSize(3);
    assertThat(found)
        .extracting(TimeSlot::getPeriod)
        .containsExactly((short) 1, (short) 2, (short) 3);
  }

  @Test
  void countBySchoolIdAndIsBreakFalse_mixedSlots_countsTeachingOnly() {
    testData.timeSlot(school).withPeriod((short) 1).isBreak(false).persist();
    testData.timeSlot(school).withPeriod((short) 2).isBreak(true).persist();
    testData.timeSlot(school).withPeriod((short) 3).isBreak(false).persist();
    testData.timeSlot(school).withPeriod((short) 4).isBreak(false).persist();
    entityManager.flush();

    long count = timeSlotRepository.countBySchoolIdAndIsBreakFalse(school.getId());

    assertThat(count).isEqualTo(3);
  }
}
