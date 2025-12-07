package com.klassenzeit.klassenzeit.accessrequest;

import com.klassenzeit.klassenzeit.accessrequest.dto.AccessRequestResponse;
import com.klassenzeit.klassenzeit.accessrequest.dto.AccessRequestSummary;
import com.klassenzeit.klassenzeit.accessrequest.dto.CreateAccessRequestRequest;
import com.klassenzeit.klassenzeit.accessrequest.dto.ReviewAccessRequestRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for managing school access requests.
 *
 * <p>Any authenticated user can create a request. Only school admins can list and review requests.
 */
@RestController
@RequestMapping("/api/schools/{schoolId}/access-requests")
public class AccessRequestController {

  private final AccessRequestService accessRequestService;

  public AccessRequestController(AccessRequestService accessRequestService) {
    this.accessRequestService = accessRequestService;
  }

  /**
   * Create an access request for a school.
   *
   * <p>Any authenticated user can request access to a school.
   */
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("isAuthenticated()")
  public AccessRequestResponse create(
      @PathVariable UUID schoolId, @Valid @RequestBody CreateAccessRequestRequest request) {
    return accessRequestService.create(schoolId, request);
  }

  /**
   * List access requests for a school.
   *
   * <p>Only school admins can view requests. Defaults to PENDING status.
   */
  @GetMapping
  @PreAuthorize("@authz.isSchoolAdmin(#schoolId)")
  public List<AccessRequestSummary> findAll(
      @PathVariable UUID schoolId, @RequestParam(required = false) AccessRequestStatus status) {
    return accessRequestService.findAllBySchool(schoolId, status);
  }

  /**
   * Get a single access request.
   *
   * <p>Only school admins can view request details.
   */
  @GetMapping("/{id}")
  @PreAuthorize("@authz.isSchoolAdmin(#schoolId)")
  public AccessRequestResponse findById(@PathVariable UUID schoolId, @PathVariable UUID id) {
    return accessRequestService.findById(schoolId, id);
  }

  /**
   * Review (approve/reject) an access request.
   *
   * <p>Only school admins can review requests.
   */
  @PutMapping("/{id}")
  @PreAuthorize("@authz.isSchoolAdmin(#schoolId)")
  public AccessRequestResponse review(
      @PathVariable UUID schoolId,
      @PathVariable UUID id,
      @Valid @RequestBody ReviewAccessRequestRequest request) {
    return accessRequestService.review(schoolId, id, request);
  }
}
