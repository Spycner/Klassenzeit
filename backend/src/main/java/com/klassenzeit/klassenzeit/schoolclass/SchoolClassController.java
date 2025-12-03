package com.klassenzeit.klassenzeit.schoolclass;

import com.klassenzeit.klassenzeit.schoolclass.dto.CreateSchoolClassRequest;
import com.klassenzeit.klassenzeit.schoolclass.dto.SchoolClassResponse;
import com.klassenzeit.klassenzeit.schoolclass.dto.SchoolClassSummary;
import com.klassenzeit.klassenzeit.schoolclass.dto.UpdateSchoolClassRequest;
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

/** REST controller for SchoolClass entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/classes")
public class SchoolClassController {

  private final SchoolClassService schoolClassService;

  public SchoolClassController(SchoolClassService schoolClassService) {
    this.schoolClassService = schoolClassService;
  }

  @GetMapping
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public List<SchoolClassSummary> findAll(@PathVariable UUID schoolId) {
    return schoolClassService.findAllBySchool(schoolId);
  }

  @GetMapping("/{id}")
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public SchoolClassResponse findById(@PathVariable UUID schoolId, @PathVariable UUID id) {
    return schoolClassService.findById(schoolId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public SchoolClassResponse create(
      @PathVariable UUID schoolId, @Valid @RequestBody CreateSchoolClassRequest request) {
    return schoolClassService.create(schoolId, request);
  }

  @PutMapping("/{id}")
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public SchoolClassResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateSchoolClassRequest request) {
    return schoolClassService.update(schoolId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void delete(@PathVariable UUID schoolId, @PathVariable UUID id) {
    schoolClassService.delete(schoolId, id);
  }
}
