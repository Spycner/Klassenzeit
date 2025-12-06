package com.klassenzeit.klassenzeit.accessrequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.accessrequest.dto.AccessRequestResponse;
import com.klassenzeit.klassenzeit.accessrequest.dto.AccessRequestSummary;
import com.klassenzeit.klassenzeit.accessrequest.dto.CreateAccessRequestRequest;
import com.klassenzeit.klassenzeit.accessrequest.dto.ReviewAccessRequestRequest;
import com.klassenzeit.klassenzeit.accessrequest.dto.ReviewDecision;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.membership.ForbiddenOperationException;
import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.user.AppUser;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class AccessRequestServiceTest extends AbstractIntegrationTest {

  @Autowired private AccessRequestService accessRequestService;
  @Autowired private SchoolMembershipRepository membershipRepository;
  @Autowired private SchoolAccessRequestRepository accessRequestRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private AppUser adminUser;
  private AppUser requestingUser;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    adminUser = testData.appUser().withEmail("admin@example.com").persist();
    requestingUser = testData.appUser().withEmail("requester@example.com").persist();
  }

  @Nested
  class Create {

    @Test
    void createsAccessRequestSuccessfully() {
      entityManager.flush();
      entityManager.clear();

      CreateAccessRequestRequest request =
          new CreateAccessRequestRequest(SchoolRole.PLANNER, "I want to help plan schedules");

      AccessRequestResponse result =
          accessRequestService.create(school.getId(), request, requestingUser.getId());

      assertThat(result.id()).isNotNull();
      assertThat(result.userId()).isEqualTo(requestingUser.getId());
      assertThat(result.userDisplayName()).isEqualTo("Test User");
      assertThat(result.schoolId()).isEqualTo(school.getId());
      assertThat(result.requestedRole()).isEqualTo(SchoolRole.PLANNER);
      assertThat(result.status()).isEqualTo(AccessRequestStatus.PENDING);
      assertThat(result.message()).isEqualTo("I want to help plan schedules");
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void defaultsToViewerRoleWhenNotSpecified() {
      entityManager.flush();
      entityManager.clear();

      CreateAccessRequestRequest request = new CreateAccessRequestRequest(null, "Please let me in");

      AccessRequestResponse result =
          accessRequestService.create(school.getId(), request, requestingUser.getId());

      assertThat(result.requestedRole()).isEqualTo(SchoolRole.VIEWER);
    }

    @Test
    void throwsWhenUserAlreadyHasMembership() {
      testData.membership(school, requestingUser).withRole(SchoolRole.VIEWER).persist();
      entityManager.flush();
      entityManager.clear();

      CreateAccessRequestRequest request =
          new CreateAccessRequestRequest(SchoolRole.PLANNER, "Upgrade my access");

      assertThatThrownBy(
              () -> accessRequestService.create(school.getId(), request, requestingUser.getId()))
          .isInstanceOf(ForbiddenOperationException.class)
          .hasMessageContaining("already have access");
    }

    @Test
    void throwsWhenUserAlreadyHasPendingRequest() {
      SchoolAccessRequest existingRequest =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.VIEWER, "First request");
      entityManager.persist(existingRequest);
      entityManager.flush();
      entityManager.clear();

      CreateAccessRequestRequest request =
          new CreateAccessRequestRequest(SchoolRole.PLANNER, "Second request");

      assertThatThrownBy(
              () -> accessRequestService.create(school.getId(), request, requestingUser.getId()))
          .isInstanceOf(ForbiddenOperationException.class)
          .hasMessageContaining("already have a pending access request");
    }

    @Test
    void allowsNewRequestAfterPreviousWasRejected() {
      SchoolAccessRequest rejectedRequest =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.VIEWER, "First request");
      rejectedRequest.reject(adminUser, "Not now");
      entityManager.persist(rejectedRequest);
      entityManager.flush();
      entityManager.clear();

      CreateAccessRequestRequest request =
          new CreateAccessRequestRequest(SchoolRole.PLANNER, "Trying again");

      AccessRequestResponse result =
          accessRequestService.create(school.getId(), request, requestingUser.getId());

      assertThat(result.status()).isEqualTo(AccessRequestStatus.PENDING);
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentSchoolId = UUID.randomUUID();
      CreateAccessRequestRequest request = new CreateAccessRequestRequest(null, null);

      assertThatThrownBy(
              () ->
                  accessRequestService.create(nonExistentSchoolId, request, requestingUser.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }

    @Test
    void throwsWhenUserNotFound() {
      UUID nonExistentUserId = UUID.randomUUID();
      CreateAccessRequestRequest request = new CreateAccessRequestRequest(null, null);

      assertThatThrownBy(
              () -> accessRequestService.create(school.getId(), request, nonExistentUserId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("User");
    }
  }

  @Nested
  class FindAllBySchool {

    @Test
    void returnsPendingRequestsByDefault() {
      AppUser user1 = testData.appUser().withEmail("user1@example.com").persist();
      AppUser user2 = testData.appUser().withEmail("user2@example.com").persist();
      AppUser user3 = testData.appUser().withEmail("user3@example.com").persist();

      SchoolAccessRequest pending1 =
          new SchoolAccessRequest(user1, school, SchoolRole.VIEWER, "Request 1");
      SchoolAccessRequest pending2 =
          new SchoolAccessRequest(user2, school, SchoolRole.PLANNER, "Request 2");
      SchoolAccessRequest approved =
          new SchoolAccessRequest(user3, school, SchoolRole.VIEWER, "Request 3");
      approved.approve(adminUser, "Welcome!");

      entityManager.persist(pending1);
      entityManager.persist(pending2);
      entityManager.persist(approved);
      entityManager.flush();
      entityManager.clear();

      List<AccessRequestSummary> result =
          accessRequestService.findAllBySchool(school.getId(), null);

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(AccessRequestSummary::status)
          .containsOnly(AccessRequestStatus.PENDING);
    }

    @Test
    void filtersRequestsByStatus() {
      AppUser user1 = testData.appUser().withEmail("user1@example.com").persist();
      AppUser user2 = testData.appUser().withEmail("user2@example.com").persist();

      SchoolAccessRequest pending =
          new SchoolAccessRequest(user1, school, SchoolRole.VIEWER, "Pending");
      SchoolAccessRequest rejected =
          new SchoolAccessRequest(user2, school, SchoolRole.VIEWER, "Rejected");
      rejected.reject(adminUser, "No");

      entityManager.persist(pending);
      entityManager.persist(rejected);
      entityManager.flush();
      entityManager.clear();

      List<AccessRequestSummary> result =
          accessRequestService.findAllBySchool(school.getId(), AccessRequestStatus.REJECTED);

      assertThat(result).hasSize(1);
      assertThat(result.get(0).status()).isEqualTo(AccessRequestStatus.REJECTED);
    }

    @Test
    void doesNotReturnRequestsFromOtherSchools() {
      School otherSchool = testData.school().withSlug("other-school").persist();

      SchoolAccessRequest thisSchoolRequest =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.VIEWER, "This school");
      AppUser otherUser = testData.appUser().withEmail("other@example.com").persist();
      SchoolAccessRequest otherSchoolRequest =
          new SchoolAccessRequest(otherUser, otherSchool, SchoolRole.VIEWER, "Other school");

      entityManager.persist(thisSchoolRequest);
      entityManager.persist(otherSchoolRequest);
      entityManager.flush();
      entityManager.clear();

      List<AccessRequestSummary> result =
          accessRequestService.findAllBySchool(school.getId(), null);

      assertThat(result).hasSize(1);
      assertThat(result.get(0).message()).isEqualTo("This school");
    }

    @Test
    void returnsEmptyListWhenNoRequests() {
      List<AccessRequestSummary> result =
          accessRequestService.findAllBySchool(school.getId(), null);

      assertThat(result).isEmpty();
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsRequestWhenFound() {
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.PLANNER, "My message");
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      AccessRequestResponse result = accessRequestService.findById(school.getId(), request.getId());

      assertThat(result.id()).isEqualTo(request.getId());
      assertThat(result.userId()).isEqualTo(requestingUser.getId());
      assertThat(result.schoolId()).isEqualTo(school.getId());
      assertThat(result.requestedRole()).isEqualTo(SchoolRole.PLANNER);
      assertThat(result.message()).isEqualTo("My message");
    }

    @Test
    void throwsWhenRequestNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> accessRequestService.findById(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("AccessRequest");
    }

    @Test
    void throwsWhenRequestBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, otherSchool, SchoolRole.VIEWER, null);
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> accessRequestService.findById(school.getId(), request.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Review {

    @Test
    void approvesRequestAndCreatesMembership() {
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.PLANNER, "Let me in");
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      ReviewAccessRequestRequest reviewRequest =
          new ReviewAccessRequestRequest(ReviewDecision.APPROVE, "Welcome aboard!", null);

      AccessRequestResponse result =
          accessRequestService.review(
              school.getId(), request.getId(), reviewRequest, adminUser.getId());

      assertThat(result.status()).isEqualTo(AccessRequestStatus.APPROVED);
      assertThat(result.responseMessage()).isEqualTo("Welcome aboard!");
      assertThat(result.reviewedById()).isEqualTo(adminUser.getId());
      assertThat(result.reviewedAt()).isNotNull();

      // Verify membership was created
      entityManager.flush();
      entityManager.clear();
      assertThat(
              membershipRepository.existsByUserIdAndSchoolIdAndActiveTrue(
                  requestingUser.getId(), school.getId()))
          .isTrue();
    }

    @Test
    void approvesWithOverriddenRole() {
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.SCHOOL_ADMIN, "Make me admin");
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      ReviewAccessRequestRequest reviewRequest =
          new ReviewAccessRequestRequest(
              ReviewDecision.APPROVE, "You can be a viewer instead", SchoolRole.VIEWER);

      accessRequestService.review(
          school.getId(), request.getId(), reviewRequest, adminUser.getId());

      // Verify membership was created with overridden role
      entityManager.flush();
      entityManager.clear();
      Optional<SchoolMembership> membership =
          membershipRepository.findByUserIdAndSchoolId(requestingUser.getId(), school.getId());
      assertThat(membership).isPresent();
      assertThat(membership.get().getRole()).isEqualTo(SchoolRole.VIEWER);
    }

    @Test
    void rejectsRequest() {
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.PLANNER, "Let me in");
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      ReviewAccessRequestRequest reviewRequest =
          new ReviewAccessRequestRequest(ReviewDecision.REJECT, "Not at this time", null);

      AccessRequestResponse result =
          accessRequestService.review(
              school.getId(), request.getId(), reviewRequest, adminUser.getId());

      assertThat(result.status()).isEqualTo(AccessRequestStatus.REJECTED);
      assertThat(result.responseMessage()).isEqualTo("Not at this time");
      assertThat(result.reviewedById()).isEqualTo(adminUser.getId());

      // Verify no membership was created
      assertThat(
              membershipRepository.existsByUserIdAndSchoolIdAndActiveTrue(
                  requestingUser.getId(), school.getId()))
          .isFalse();
    }

    @Test
    void throwsWhenRequestAlreadyReviewed() {
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.VIEWER, null);
      request.reject(adminUser, "No");
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      ReviewAccessRequestRequest reviewRequest =
          new ReviewAccessRequestRequest(ReviewDecision.APPROVE, "Changed my mind", null);

      assertThatThrownBy(
              () ->
                  accessRequestService.review(
                      school.getId(), request.getId(), reviewRequest, adminUser.getId()))
          .isInstanceOf(ForbiddenOperationException.class)
          .hasMessageContaining("already been reviewed");
    }

    @Test
    void throwsWhenRequestNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      ReviewAccessRequestRequest reviewRequest =
          new ReviewAccessRequestRequest(ReviewDecision.APPROVE, null, null);

      assertThatThrownBy(
              () ->
                  accessRequestService.review(
                      school.getId(), nonExistentId, reviewRequest, adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Cancel {

    @Test
    void cancelsOwnPendingRequest() {
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.VIEWER, "Cancel me");
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      accessRequestService.cancel(request.getId(), requestingUser.getId());

      entityManager.flush();
      entityManager.clear();

      SchoolAccessRequest updated = accessRequestRepository.findById(request.getId()).orElseThrow();
      assertThat(updated.getStatus()).isEqualTo(AccessRequestStatus.CANCELLED);
    }

    @Test
    void throwsWhenCancellingOtherUsersRequest() {
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.VIEWER, null);
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> accessRequestService.cancel(request.getId(), adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenCancellingNonPendingRequest() {
      SchoolAccessRequest request =
          new SchoolAccessRequest(requestingUser, school, SchoolRole.VIEWER, null);
      request.reject(adminUser, "No");
      entityManager.persist(request);
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> accessRequestService.cancel(request.getId(), requestingUser.getId()))
          .isInstanceOf(ForbiddenOperationException.class)
          .hasMessageContaining("Only pending requests can be cancelled");
    }

    @Test
    void throwsWhenRequestNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> accessRequestService.cancel(nonExistentId, requestingUser.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
