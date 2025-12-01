package com.klassenzeit.klassenzeit.school.dto;

import java.util.UUID;

/** Summary DTO for a school (for list responses). */
public record SchoolSummary(UUID id, String name, String slug, String schoolType) {}
