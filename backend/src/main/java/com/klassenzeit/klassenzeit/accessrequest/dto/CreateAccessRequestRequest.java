package com.klassenzeit.klassenzeit.accessrequest.dto;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import jakarta.validation.constraints.Size;

/** Request DTO for creating an access request to a school. */
public record CreateAccessRequestRequest(
    SchoolRole requestedRole, @Size(max = 1000) String message) {}
