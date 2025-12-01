package com.klassenzeit.klassenzeit.teacher.dto;

import com.klassenzeit.klassenzeit.common.QualificationLevel;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;

/** Request DTO for updating a teacher qualification. */
public record UpdateQualificationRequest(
    QualificationLevel qualificationLevel,
    List<@Min(1) @Max(13) Integer> canTeachGrades,
    @Min(1) @Max(50) Integer maxHoursPerWeek) {}
