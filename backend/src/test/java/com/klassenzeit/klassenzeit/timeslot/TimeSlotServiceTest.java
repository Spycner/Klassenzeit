package com.klassenzeit.klassenzeit.timeslot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.timeslot.dto.CreateTimeSlotRequest;
import com.klassenzeit.klassenzeit.timeslot.dto.TimeSlotResponse;
import com.klassenzeit.klassenzeit.timeslot.dto.TimeSlotSummary;
import com.klassenzeit.klassenzeit.timeslot.dto.UpdateTimeSlotRequest;
import jakarta.persistence.EntityManager;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class TimeSlotServiceTest extends AbstractIntegrationTest {

  @Autowired private TimeSlotService timeSlotService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Nested
  class FindAllBySchool {

    @Test
    void returnsAllTimeSlotsForSchool() {
      testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
      testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 2).persist();
      entityManager.flush();
      entityManager.clear();

      List<TimeSlotSummary> result = timeSlotService.findAllBySchool(school.getId());

      assertThat(result).hasSize(2);
    }

    @Test
    void doesNotReturnTimeSlotsFromOtherSchool() {
      testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 1).persist();

      School otherSchool = testData.school().withSlug("other-school").persist();
      testData.timeSlot(otherSchool).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
      entityManager.flush();
      entityManager.clear();

      List<TimeSlotSummary> result = timeSlotService.findAllBySchool(school.getId());

      assertThat(result).hasSize(1);
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsTimeSlotWhenFound() {
      TimeSlot timeSlot =
          testData
              .timeSlot(school)
              .withDayOfWeek((short) 0)
              .withPeriod((short) 1)
              .withTimes(LocalTime.of(8, 0), LocalTime.of(8, 45))
              .persist();
      entityManager.flush();
      entityManager.clear();

      TimeSlotResponse result = timeSlotService.findById(school.getId(), timeSlot.getId());

      assertThat(result.id()).isEqualTo(timeSlot.getId());
      assertThat(result.dayOfWeek()).isEqualTo((short) 0);
      assertThat(result.period()).isEqualTo((short) 1);
      assertThat(result.startTime()).isEqualTo(LocalTime.of(8, 0));
      assertThat(result.endTime()).isEqualTo(LocalTime.of(8, 45));
    }

    @Test
    void throwsWhenTimeSlotNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> timeSlotService.findById(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenTimeSlotBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      TimeSlot timeSlot = testData.timeSlot(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> timeSlotService.findById(school.getId(), timeSlot.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsTimeSlotSuccessfully() {
      CreateTimeSlotRequest request =
          new CreateTimeSlotRequest(
              (short) 0, (short) 1, LocalTime.of(8, 0), LocalTime.of(8, 45), false, "1st Period");

      TimeSlotResponse result = timeSlotService.create(school.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.dayOfWeek()).isEqualTo((short) 0);
      assertThat(result.period()).isEqualTo((short) 1);
      assertThat(result.startTime()).isEqualTo(LocalTime.of(8, 0));
      assertThat(result.endTime()).isEqualTo(LocalTime.of(8, 45));
      assertThat(result.isBreak()).isFalse();
      assertThat(result.label()).isEqualTo("1st Period");
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentSchoolId = UUID.randomUUID();
      CreateTimeSlotRequest request =
          new CreateTimeSlotRequest(
              (short) 0, (short) 1, LocalTime.of(8, 0), LocalTime.of(8, 45), null, null);

      assertThatThrownBy(() -> timeSlotService.create(nonExistentSchoolId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      TimeSlot timeSlot =
          testData
              .timeSlot(school)
              .withDayOfWeek((short) 0)
              .withPeriod((short) 1)
              .withTimes(LocalTime.of(8, 0), LocalTime.of(8, 45))
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateTimeSlotRequest request =
          new UpdateTimeSlotRequest(
              (short) 1, (short) 2, LocalTime.of(9, 0), LocalTime.of(9, 45), true, "Break", null);

      TimeSlotResponse result = timeSlotService.update(school.getId(), timeSlot.getId(), request);

      assertThat(result.dayOfWeek()).isEqualTo((short) 1);
      assertThat(result.period()).isEqualTo((short) 2);
      assertThat(result.startTime()).isEqualTo(LocalTime.of(9, 0));
      assertThat(result.endTime()).isEqualTo(LocalTime.of(9, 45));
      assertThat(result.isBreak()).isTrue();
      assertThat(result.label()).isEqualTo("Break");
    }

    @Test
    void updatesOnlyProvidedFields() {
      TimeSlot timeSlot =
          testData
              .timeSlot(school)
              .withDayOfWeek((short) 0)
              .withPeriod((short) 1)
              .withLabel("1st Period")
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateTimeSlotRequest request =
          new UpdateTimeSlotRequest(null, (short) 2, null, null, null, null, null);

      TimeSlotResponse result = timeSlotService.update(school.getId(), timeSlot.getId(), request);

      assertThat(result.dayOfWeek()).isEqualTo((short) 0); // unchanged
      assertThat(result.period()).isEqualTo((short) 2); // changed
      assertThat(result.label()).isEqualTo("1st Period"); // unchanged
    }

    @Test
    void throwsWhenTimeSlotNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateTimeSlotRequest request =
          new UpdateTimeSlotRequest(null, (short) 2, null, null, null, null, null);

      assertThatThrownBy(() -> timeSlotService.update(school.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesTimeSlot() {
      TimeSlot timeSlot = testData.timeSlot(school).persist();
      UUID timeSlotId = timeSlot.getId();
      entityManager.flush();
      entityManager.clear();

      timeSlotService.delete(school.getId(), timeSlotId);

      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> timeSlotService.findById(school.getId(), timeSlotId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenTimeSlotNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> timeSlotService.delete(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
