package com.klassenzeit.klassenzeit.user;

import com.klassenzeit.klassenzeit.accessrequest.AccessRequestService;
import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import com.klassenzeit.klassenzeit.security.CurrentUserAuthentication;
import com.klassenzeit.klassenzeit.user.dto.UserProfileResponse;
import com.klassenzeit.klassenzeit.user.dto.UserProfileResponse.SchoolMembershipSummary;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for current user operations. */
@RestController
@RequestMapping("/api/users")
public class AppUserController {

  private final SchoolMembershipRepository schoolMembershipRepository;
  private final AccessRequestService accessRequestService;

  public AppUserController(
      SchoolMembershipRepository schoolMembershipRepository,
      AccessRequestService accessRequestService) {
    this.schoolMembershipRepository = schoolMembershipRepository;
    this.accessRequestService = accessRequestService;
  }

  /** Get the current user's profile with their school memberships. */
  @GetMapping("/me")
  public UserProfileResponse getCurrentUser(Authentication authentication) {
    CurrentUser currentUser = extractCurrentUser(authentication);

    List<SchoolMembership> memberships =
        schoolMembershipRepository.findByUserIdWithSchool(currentUser.id());

    List<SchoolMembershipSummary> schoolSummaries =
        memberships.stream()
            .map(
                m ->
                    new SchoolMembershipSummary(
                        m.getSchool().getId(), m.getSchool().getName(), m.getRole()))
            .toList();

    return new UserProfileResponse(
        currentUser.id(),
        currentUser.email(),
        currentUser.displayName(),
        currentUser.isPlatformAdmin(),
        schoolSummaries);
  }

  /**
   * Cancel a pending access request.
   *
   * <p>Users can only cancel their own pending requests.
   */
  @DeleteMapping("/me/access-requests/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("isAuthenticated()")
  public void cancelAccessRequest(@PathVariable UUID id) {
    accessRequestService.cancel(id);
  }

  private CurrentUser extractCurrentUser(Authentication authentication) {
    if (authentication instanceof CurrentUserAuthentication cua) {
      return cua.getCurrentUser();
    }
    throw new IllegalStateException(
        "Expected CurrentUserAuthentication but got: " + authentication);
  }
}
