package com.klassenzeit.klassenzeit.teacher.dto;

import com.klassenzeit.klassenzeit.common.QualificationLevel;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Response DTO for a teacher qualification. */
public record QualificationResponse(
    UUID id,
    UUID subjectId,
    String subjectName,
    QualificationLevel qualificationLevel,
    List<Integer> canTeachGrades,
    Integer maxHoursPerWeek,
    Instant createdAt,
    Instant updatedAt) {}
