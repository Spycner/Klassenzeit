package com.klassenzeit.klassenzeit.user;

import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import com.klassenzeit.klassenzeit.security.CurrentUserAuthentication;
import com.klassenzeit.klassenzeit.user.dto.UserProfileResponse;
import com.klassenzeit.klassenzeit.user.dto.UserProfileResponse.SchoolMembershipSummary;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for current user operations. */
@RestController
@RequestMapping("/api/users")
public class AppUserController {

  private final SchoolMembershipRepository schoolMembershipRepository;

  public AppUserController(SchoolMembershipRepository schoolMembershipRepository) {
    this.schoolMembershipRepository = schoolMembershipRepository;
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

  private CurrentUser extractCurrentUser(Authentication authentication) {
    if (authentication instanceof CurrentUserAuthentication cua) {
      return cua.getCurrentUser();
    }
    throw new IllegalStateException(
        "Expected CurrentUserAuthentication but got: " + authentication);
  }
}
