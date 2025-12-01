package com.klassenzeit.klassenzeit.lesson.dto;

import com.klassenzeit.klassenzeit.common.WeekPattern;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Request DTO for creating a lesson. */
public record CreateLessonRequest(
    @NotNull UUID schoolClassId,
    @NotNull UUID teacherId,
    @NotNull UUID subjectId,
    @NotNull UUID timeslotId,
    UUID roomId,
    WeekPattern weekPattern) {}
