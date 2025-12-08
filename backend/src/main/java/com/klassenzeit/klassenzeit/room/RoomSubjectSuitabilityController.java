package com.klassenzeit.klassenzeit.room;

import com.klassenzeit.klassenzeit.room.dto.CreateRoomSubjectSuitabilityRequest;
import com.klassenzeit.klassenzeit.room.dto.RoomSubjectSuitabilitySummary;
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

/** REST controller for RoomSubjectSuitability entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/rooms/{roomId}/subjects")
public class RoomSubjectSuitabilityController {

  private final RoomSubjectSuitabilityService suitabilityService;

  public RoomSubjectSuitabilityController(RoomSubjectSuitabilityService suitabilityService) {
    this.suitabilityService = suitabilityService;
  }

  @GetMapping
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public List<RoomSubjectSuitabilitySummary> findAll(
      @PathVariable UUID schoolId, @PathVariable UUID roomId) {
    return suitabilityService.findAllByRoom(schoolId, roomId);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public RoomSubjectSuitabilitySummary create(
      @PathVariable UUID schoolId,
      @PathVariable UUID roomId,
      @Valid @RequestBody CreateRoomSubjectSuitabilityRequest request) {
    return suitabilityService.create(schoolId, roomId, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void delete(
      @PathVariable UUID schoolId, @PathVariable UUID roomId, @PathVariable UUID id) {
    suitabilityService.delete(schoolId, roomId, id);
  }
}
