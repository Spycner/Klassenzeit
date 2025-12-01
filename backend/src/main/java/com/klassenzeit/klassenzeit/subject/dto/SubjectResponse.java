package com.klassenzeit.klassenzeit.subject.dto;

import java.time.Instant;
import java.util.UUID;

/** Response DTO for a subject. */
public record SubjectResponse(
    UUID id,
    String name,
    String abbreviation,
    String color,
    Instant createdAt,
    Instant updatedAt) {}
