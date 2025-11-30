package com.klassenzeit.klassenzeit.lesson;

import com.klassenzeit.klassenzeit.common.WeekPattern;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

public interface LessonRepository extends JpaRepository<Lesson, UUID> {

  List<Lesson> findByTermId(UUID termId);

  List<Lesson> findByTermIdAndSchoolClassId(UUID termId, UUID schoolClassId);

  List<Lesson> findByTermIdAndTeacherId(UUID termId, UUID teacherId);

  List<Lesson> findByTermIdAndSubjectId(UUID termId, UUID subjectId);

  List<Lesson> findByTermIdAndRoomId(UUID termId, UUID roomId);

  List<Lesson> findByTermIdAndTimeslotId(UUID termId, UUID timeslotId);

  List<Lesson> findByTermIdAndWeekPattern(UUID termId, WeekPattern weekPattern);

  // Conflict detection queries
  List<Lesson> findByTermIdAndTeacherIdAndTimeslotId(UUID termId, UUID teacherId, UUID timeslotId);

  List<Lesson> findByTermIdAndRoomIdAndTimeslotId(UUID termId, UUID roomId, UUID timeslotId);

  List<Lesson> findByTermIdAndSchoolClassIdAndTimeslotId(
      UUID termId, UUID schoolClassId, UUID timeslotId);

  // Schedule retrieval
  List<Lesson> findByTermIdAndSchoolClassIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc(
      UUID termId, UUID schoolClassId);

  List<Lesson> findByTermIdAndTeacherIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc(
      UUID termId, UUID teacherId);

  List<Lesson> findByTermIdAndRoomIdOrderByTimeslotDayOfWeekAscTimeslotPeriodAsc(
      UUID termId, UUID roomId);

  // Counting
  long countByTermIdAndTeacherId(UUID termId, UUID teacherId);

  long countByTermIdAndSchoolClassId(UUID termId, UUID schoolClassId);

  // Delete operations
  @Modifying
  @Transactional
  void deleteByTermId(UUID termId);
}
