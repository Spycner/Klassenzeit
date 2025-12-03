package com.klassenzeit.klassenzeit.admin;

import com.klassenzeit.klassenzeit.admin.dto.AssignAdminRequest;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipService;
import com.klassenzeit.klassenzeit.membership.dto.MembershipResponse;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for platform admin operations. */
@RestController
@RequestMapping("/api/admin/schools")
@PreAuthorize("@authz.isPlatformAdmin()")
public class PlatformAdminController {

  private final SchoolMembershipService membershipService;
  private final AuthorizationService authorizationService;

  public PlatformAdminController(
      SchoolMembershipService membershipService, AuthorizationService authorizationService) {
    this.membershipService = membershipService;
    this.authorizationService = authorizationService;
  }

  /**
   * Assign a user as SCHOOL_ADMIN of a school.
   *
   * <p>This endpoint allows platform admins to assign school administrators, especially for newly
   * created schools that have no admins yet.
   */
  @PostMapping("/{schoolId}/admins")
  @ResponseStatus(HttpStatus.CREATED)
  public MembershipResponse assignAdmin(
      @PathVariable UUID schoolId, @Valid @RequestBody AssignAdminRequest request) {
    UUID grantedById = authorizationService.getCurrentUser().id();
    return membershipService.assignSchoolAdmin(schoolId, request.userId(), grantedById);
  }
}
