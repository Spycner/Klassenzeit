package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.teacher.dto.AvailabilityResponse;
import com.klassenzeit.klassenzeit.teacher.dto.AvailabilitySummary;
import com.klassenzeit.klassenzeit.teacher.dto.CreateAvailabilityRequest;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateAvailabilityRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for TeacherAvailability entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/teachers/{teacherId}/availability")
public class TeacherAvailabilityController {

  private final TeacherAvailabilityService availabilityService;

  public TeacherAvailabilityController(TeacherAvailabilityService availabilityService) {
    this.availabilityService = availabilityService;
  }

  @GetMapping
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public List<AvailabilitySummary> findAll(
      @PathVariable UUID schoolId, @PathVariable UUID teacherId) {
    return availabilityService.findAllByTeacher(schoolId, teacherId);
  }

  @GetMapping("/{id}")
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public AvailabilityResponse findById(
      @PathVariable UUID schoolId, @PathVariable UUID teacherId, @PathVariable UUID id) {
    return availabilityService.findById(schoolId, teacherId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public AvailabilityResponse create(
      @PathVariable UUID schoolId,
      @PathVariable UUID teacherId,
      @Valid @RequestBody CreateAvailabilityRequest request) {
    return availabilityService.create(schoolId, teacherId, request);
  }

  @PutMapping("/{id}")
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public AvailabilityResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID teacherId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateAvailabilityRequest request) {
    return availabilityService.update(schoolId, teacherId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void delete(
      @PathVariable UUID schoolId, @PathVariable UUID teacherId, @PathVariable UUID id) {
    availabilityService.delete(schoolId, teacherId, id);
  }
}
