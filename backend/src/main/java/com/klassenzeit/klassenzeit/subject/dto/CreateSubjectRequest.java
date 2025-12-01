package com.klassenzeit.klassenzeit.subject.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Request DTO for creating a new subject. */
public record CreateSubjectRequest(
    @NotBlank @Size(max = 100) String name,
    @NotBlank @Size(max = 10) String abbreviation,
    @Size(max = 7) String color) {}
