package com.klassenzeit.klassenzeit.subject;

import com.klassenzeit.klassenzeit.room.RoomSubjectSuitabilityService;
import com.klassenzeit.klassenzeit.subject.dto.AddRoomToSubjectRequest;
import com.klassenzeit.klassenzeit.subject.dto.SubjectRoomSummary;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for Subject-to-Room relationships. */
@RestController
@RequestMapping("/api/schools/{schoolId}/subjects/{subjectId}/rooms")
public class SubjectRoomController {

  private final RoomSubjectSuitabilityService suitabilityService;

  public SubjectRoomController(RoomSubjectSuitabilityService suitabilityService) {
    this.suitabilityService = suitabilityService;
  }

  @GetMapping
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public List<SubjectRoomSummary> findRoomsForSubject(
      @PathVariable UUID schoolId, @PathVariable UUID subjectId) {
    return suitabilityService.findRoomsForSubject(schoolId, subjectId);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public SubjectRoomSummary addRoomToSubject(
      @PathVariable UUID schoolId,
      @PathVariable UUID subjectId,
      @Valid @RequestBody AddRoomToSubjectRequest request) {
    return suitabilityService.addRoomToSubject(schoolId, subjectId, request);
  }

  @DeleteMapping("/{roomId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void removeRoomFromSubject(
      @PathVariable UUID schoolId, @PathVariable UUID subjectId, @PathVariable UUID roomId) {
    suitabilityService.removeRoomFromSubject(schoolId, subjectId, roomId);
  }
}
