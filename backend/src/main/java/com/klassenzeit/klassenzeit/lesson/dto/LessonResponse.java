package com.klassenzeit.klassenzeit.lesson.dto;

import com.klassenzeit.klassenzeit.common.WeekPattern;
import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

/** Response DTO for a lesson. */
public record LessonResponse(
    UUID id,
    UUID schoolClassId,
    String schoolClassName,
    UUID teacherId,
    String teacherName,
    UUID subjectId,
    String subjectName,
    UUID timeslotId,
    Short dayOfWeek,
    Short period,
    LocalTime startTime,
    LocalTime endTime,
    UUID roomId,
    String roomName,
    WeekPattern weekPattern,
    Instant createdAt,
    Instant updatedAt) {}
