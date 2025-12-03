package com.klassenzeit.klassenzeit.accessrequest.dto;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import jakarta.validation.constraints.NotNull;

/** Request DTO for reviewing (approving/rejecting) an access request. */
public record ReviewAccessRequestRequest(
    @NotNull ReviewDecision decision, String responseMessage, SchoolRole grantedRole) {}
