package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.school.dto.CreateTermRequest;
import com.klassenzeit.klassenzeit.school.dto.TermResponse;
import com.klassenzeit.klassenzeit.school.dto.TermSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateTermRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for Term entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/school-years/{schoolYearId}/terms")
public class TermController {

  private final TermService termService;

  public TermController(TermService termService) {
    this.termService = termService;
  }

  @GetMapping
  public List<TermSummary> findAll(@PathVariable UUID schoolId, @PathVariable UUID schoolYearId) {
    return termService.findAllBySchoolYear(schoolId, schoolYearId);
  }

  @GetMapping("/{id}")
  public TermResponse findById(
      @PathVariable UUID schoolId, @PathVariable UUID schoolYearId, @PathVariable UUID id) {
    return termService.findById(schoolId, schoolYearId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public TermResponse create(
      @PathVariable UUID schoolId,
      @PathVariable UUID schoolYearId,
      @Valid @RequestBody CreateTermRequest request) {
    return termService.create(schoolId, schoolYearId, request);
  }

  @PutMapping("/{id}")
  public TermResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID schoolYearId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateTermRequest request) {
    return termService.update(schoolId, schoolYearId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @PathVariable UUID schoolId, @PathVariable UUID schoolYearId, @PathVariable UUID id) {
    termService.delete(schoolId, schoolYearId, id);
  }
}
