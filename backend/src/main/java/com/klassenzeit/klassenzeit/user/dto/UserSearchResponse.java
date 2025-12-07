package com.klassenzeit.klassenzeit.user.dto;

import java.util.UUID;

/** Response DTO for user search results. */
public record UserSearchResponse(UUID id, String email, String displayName) {}
