package com.klassenzeit.klassenzeit.teacher.dto;

import com.klassenzeit.klassenzeit.common.QualificationLevel;
import java.util.UUID;

/** Summary DTO for a teacher qualification (for list responses). */
public record QualificationSummary(
    UUID id, UUID subjectId, String subjectName, QualificationLevel qualificationLevel) {}
