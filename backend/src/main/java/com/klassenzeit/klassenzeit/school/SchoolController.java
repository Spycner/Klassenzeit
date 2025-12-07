package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.school.dto.CreateSchoolRequest;
import com.klassenzeit.klassenzeit.school.dto.SchoolResponse;
import com.klassenzeit.klassenzeit.school.dto.SchoolSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateSchoolRequest;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import com.klassenzeit.klassenzeit.security.CurrentUser;
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

/** REST controller for School entities. */
@RestController
@RequestMapping("/api/schools")
public class SchoolController {

  private final SchoolService schoolService;
  private final AuthorizationService authorizationService;

  public SchoolController(SchoolService schoolService, AuthorizationService authorizationService) {
    this.schoolService = schoolService;
    this.authorizationService = authorizationService;
  }

  @GetMapping
  @PreAuthorize("@authz.canListSchools()")
  public List<SchoolSummary> findAll() {
    CurrentUser currentUser = authorizationService.getCurrentUser();
    return schoolService.findAllForUser(currentUser);
  }

  /**
   * Find a school by identifier (UUID or slug).
   *
   * <p>If accessing via an old slug that has since been changed, returns 301 redirect.
   */
  @GetMapping("/{identifier}")
  @PreAuthorize("@authz.canAccessSchoolByIdentifier(#identifier)")
  public SchoolResponse findByIdentifier(@PathVariable String identifier) {
    return schoolService.findByIdentifier(identifier);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.isPlatformAdmin()")
  public SchoolResponse create(@Valid @RequestBody CreateSchoolRequest request) {
    return schoolService.create(request);
  }

  @PutMapping("/{id}")
  @PreAuthorize("@authz.isSchoolAdmin(#id)")
  public SchoolResponse update(
      @PathVariable UUID id, @Valid @RequestBody UpdateSchoolRequest request) {
    return schoolService.update(id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.isSchoolAdmin(#id)")
  public void delete(@PathVariable UUID id) {
    schoolService.delete(id);
  }
}
