package com.klassenzeit.klassenzeit.membership;

import com.klassenzeit.klassenzeit.membership.dto.CreateMembershipRequest;
import com.klassenzeit.klassenzeit.membership.dto.MembershipResponse;
import com.klassenzeit.klassenzeit.membership.dto.MembershipSummary;
import com.klassenzeit.klassenzeit.membership.dto.UpdateMembershipRequest;
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

/**
 * REST controller for managing school memberships.
 *
 * <p>All endpoints require SCHOOL_ADMIN role for the specified school.
 */
@RestController
@RequestMapping("/api/schools/{schoolId}/members")
public class SchoolMembershipController {

  private final SchoolMembershipService membershipService;

  public SchoolMembershipController(SchoolMembershipService membershipService) {
    this.membershipService = membershipService;
  }

  @GetMapping
  @PreAuthorize("@authz.canManageMembers(#schoolId)")
  public List<MembershipSummary> findAll(@PathVariable UUID schoolId) {
    return membershipService.findAllBySchool(schoolId);
  }

  @GetMapping("/{id}")
  @PreAuthorize("@authz.canManageMembers(#schoolId)")
  public MembershipResponse findById(@PathVariable UUID schoolId, @PathVariable UUID id) {
    return membershipService.findById(schoolId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageMembers(#schoolId)")
  public MembershipResponse create(
      @PathVariable UUID schoolId, @Valid @RequestBody CreateMembershipRequest request) {
    return membershipService.create(schoolId, request);
  }

  @PutMapping("/{id}")
  @PreAuthorize("@authz.canManageMembers(#schoolId)")
  public MembershipResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateMembershipRequest request) {
    return membershipService.update(schoolId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageMembers(#schoolId)")
  public void delete(@PathVariable UUID schoolId, @PathVariable UUID id) {
    membershipService.delete(schoolId, id);
  }
}
