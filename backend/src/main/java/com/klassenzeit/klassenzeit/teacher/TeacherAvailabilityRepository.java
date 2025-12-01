package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.common.AvailabilityType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

public interface TeacherAvailabilityRepository extends JpaRepository<TeacherAvailability, UUID> {

  List<TeacherAvailability> findByTeacherId(UUID teacherId);

  List<TeacherAvailability> findByTeacherIdAndTermId(UUID teacherId, UUID termId);

  List<TeacherAvailability> findByTeacherIdAndTermIsNull(UUID teacherId);

  List<TeacherAvailability> findByTeacherIdAndAvailabilityType(
      UUID teacherId, AvailabilityType type);

  Optional<TeacherAvailability> findByTeacherIdAndTermIdAndDayOfWeekAndPeriod(
      UUID teacherId, UUID termId, Short dayOfWeek, Short period);

  List<TeacherAvailability> findByTeacherIdAndDayOfWeek(UUID teacherId, Short dayOfWeek);

  @Modifying
  @Transactional
  void deleteByTeacherIdAndTermId(UUID teacherId, UUID termId);
}
