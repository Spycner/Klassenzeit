package com.klassenzeit.klassenzeit.lesson.dto;

import com.klassenzeit.klassenzeit.common.WeekPattern;
import java.util.UUID;

/** Request DTO for updating a lesson. */
public record UpdateLessonRequest(
    UUID schoolClassId,
    UUID teacherId,
    UUID subjectId,
    UUID timeslotId,
    UUID roomId,
    WeekPattern weekPattern,
    Long version) {}
