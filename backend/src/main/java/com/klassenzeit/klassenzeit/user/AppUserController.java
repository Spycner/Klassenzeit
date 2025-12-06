package com.klassenzeit.klassenzeit.user;

import com.klassenzeit.klassenzeit.accessrequest.AccessRequestService;
import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import com.klassenzeit.klassenzeit.security.CurrentUserAuthentication;
import com.klassenzeit.klassenzeit.user.dto.UserProfileResponse;
import com.klassenzeit.klassenzeit.user.dto.UserProfileResponse.SchoolMembershipSummary;
import com.klassenzeit.klassenzeit.user.dto.UserSearchResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for current user operations. */
@RestController
@RequestMapping("/api/users")
public class AppUserController {

  private final SchoolMembershipRepository schoolMembershipRepository;
  private final AccessRequestService accessRequestService;
  private final AppUserRepository appUserRepository;

  public AppUserController(
      SchoolMembershipRepository schoolMembershipRepository,
      AccessRequestService accessRequestService,
      AppUserRepository appUserRepository) {
    this.schoolMembershipRepository = schoolMembershipRepository;
    this.accessRequestService = accessRequestService;
    this.appUserRepository = appUserRepository;
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
   * Search for a user by email.
   *
   * <p>Returns the user if found, or null if not found. Only platform admins and users with at
   * least one school membership can search for users.
   */
  @GetMapping("/search")
  @PreAuthorize("@authz.canSearchUsers()")
  public UserSearchResponse searchByEmail(@RequestParam String email) {
    return appUserRepository
        .findByEmail(email)
        .map(u -> new UserSearchResponse(u.getId(), u.getEmail(), u.getDisplayName()))
        .orElse(null);
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
