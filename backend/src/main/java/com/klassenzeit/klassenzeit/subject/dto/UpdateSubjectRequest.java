package com.klassenzeit.klassenzeit.subject.dto;

import jakarta.validation.constraints.Size;

/** Request DTO for updating a subject. */
public record UpdateSubjectRequest(
    @Size(max = 100) String name,
    @Size(max = 10) String abbreviation,
    @Size(max = 7) String color) {}
