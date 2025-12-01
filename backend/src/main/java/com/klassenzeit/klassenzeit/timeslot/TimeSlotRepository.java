package com.klassenzeit.klassenzeit.timeslot;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TimeSlotRepository extends JpaRepository<TimeSlot, UUID> {

  List<TimeSlot> findBySchoolId(UUID schoolId);

  List<TimeSlot> findBySchoolIdAndIsBreakFalse(UUID schoolId);

  List<TimeSlot> findBySchoolIdAndIsBreakTrue(UUID schoolId);

  List<TimeSlot> findBySchoolIdOrderByDayOfWeekAscPeriodAsc(UUID schoolId);

  Optional<TimeSlot> findBySchoolIdAndDayOfWeekAndPeriod(
      UUID schoolId, Short dayOfWeek, Short period);

  boolean existsBySchoolIdAndDayOfWeekAndPeriod(UUID schoolId, Short dayOfWeek, Short period);

  List<TimeSlot> findBySchoolIdAndDayOfWeekOrderByPeriodAsc(UUID schoolId, Short dayOfWeek);

  long countBySchoolIdAndIsBreakFalse(UUID schoolId);
}
