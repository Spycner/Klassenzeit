package com.klassenzeit.klassenzeit.accessrequest.dto;

import com.klassenzeit.klassenzeit.membership.SchoolRole;

/** Request DTO for creating an access request to a school. */
public record CreateAccessRequestRequest(SchoolRole requestedRole, String message) {}
