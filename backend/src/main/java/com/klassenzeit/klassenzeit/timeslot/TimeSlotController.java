package com.klassenzeit.klassenzeit.timeslot;

import com.klassenzeit.klassenzeit.timeslot.dto.CreateTimeSlotRequest;
import com.klassenzeit.klassenzeit.timeslot.dto.TimeSlotResponse;
import com.klassenzeit.klassenzeit.timeslot.dto.TimeSlotSummary;
import com.klassenzeit.klassenzeit.timeslot.dto.UpdateTimeSlotRequest;
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

/** REST controller for TimeSlot entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/time-slots")
public class TimeSlotController {

  private final TimeSlotService timeSlotService;

  public TimeSlotController(TimeSlotService timeSlotService) {
    this.timeSlotService = timeSlotService;
  }

  @GetMapping
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public List<TimeSlotSummary> findAll(@PathVariable UUID schoolId) {
    return timeSlotService.findAllBySchool(schoolId);
  }

  @GetMapping("/{id}")
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public TimeSlotResponse findById(@PathVariable UUID schoolId, @PathVariable UUID id) {
    return timeSlotService.findById(schoolId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public TimeSlotResponse create(
      @PathVariable UUID schoolId, @Valid @RequestBody CreateTimeSlotRequest request) {
    return timeSlotService.create(schoolId, request);
  }

  @PutMapping("/{id}")
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public TimeSlotResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateTimeSlotRequest request) {
    return timeSlotService.update(schoolId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void delete(@PathVariable UUID schoolId, @PathVariable UUID id) {
    timeSlotService.delete(schoolId, id);
  }
}
