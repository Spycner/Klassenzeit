package com.klassenzeit.klassenzeit.lesson.dto;

import com.klassenzeit.klassenzeit.common.WeekPattern;
import java.time.LocalTime;
import java.util.UUID;

/** Summary DTO for a lesson (for list responses). */
public record LessonSummary(
    UUID id,
    String schoolClassName,
    String teacherName,
    String subjectName,
    Short dayOfWeek,
    Short period,
    LocalTime startTime,
    LocalTime endTime,
    String roomName,
    WeekPattern weekPattern) {}
