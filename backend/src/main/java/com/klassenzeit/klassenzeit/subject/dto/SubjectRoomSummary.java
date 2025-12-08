package com.klassenzeit.klassenzeit.subject.dto;

import java.util.UUID;

/** Summary DTO for a room assigned to a subject. */
public record SubjectRoomSummary(
    UUID suitabilityId, UUID roomId, String roomName, String building) {}
