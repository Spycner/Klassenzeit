package com.klassenzeit.klassenzeit.teacher.dto;

import com.klassenzeit.klassenzeit.common.QualificationLevel;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/** Request DTO for creating a teacher qualification. */
public record CreateQualificationRequest(
    @NotNull UUID subjectId,
    @NotNull QualificationLevel qualificationLevel,
    List<@Min(1) @Max(13) Integer> canTeachGrades,
    @Min(1) @Max(50) Integer maxHoursPerWeek) {}
