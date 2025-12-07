package com.klassenzeit.klassenzeit.accessrequest;

import com.klassenzeit.klassenzeit.accessrequest.dto.AccessRequestResponse;
import com.klassenzeit.klassenzeit.accessrequest.dto.AccessRequestSummary;
import com.klassenzeit.klassenzeit.accessrequest.dto.CreateAccessRequestRequest;
import com.klassenzeit.klassenzeit.accessrequest.dto.ReviewAccessRequestRequest;
import com.klassenzeit.klassenzeit.accessrequest.dto.ReviewDecision;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.membership.ForbiddenOperationException;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipService;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.membership.dto.CreateMembershipRequest;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolRepository;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import com.klassenzeit.klassenzeit.user.AppUser;
import com.klassenzeit.klassenzeit.user.AppUserRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for SchoolAccessRequest operations. */
@Service
@Transactional(readOnly = true)
public class AccessRequestService {

  private final SchoolAccessRequestRepository accessRequestRepository;
  private final SchoolRepository schoolRepository;
  private final AppUserRepository appUserRepository;
  private final SchoolMembershipRepository membershipRepository;
  private final SchoolMembershipService membershipService;
  private final AuthorizationService authorizationService;

  public AccessRequestService(
      SchoolAccessRequestRepository accessRequestRepository,
      SchoolRepository schoolRepository,
      AppUserRepository appUserRepository,
      SchoolMembershipRepository membershipRepository,
      SchoolMembershipService membershipService,
      AuthorizationService authorizationService) {
    this.accessRequestRepository = accessRequestRepository;
    this.schoolRepository = schoolRepository;
    this.appUserRepository = appUserRepository;
    this.membershipRepository = membershipRepository;
    this.membershipService = membershipService;
    this.authorizationService = authorizationService;
  }

  /**
   * List access requests for a school.
   *
   * @param schoolId the school ID
   * @param status the status filter (defaults to PENDING if null)
   * @return list of access request summaries
   */
  public List<AccessRequestSummary> findAllBySchool(UUID schoolId, AccessRequestStatus status) {
    AccessRequestStatus effectiveStatus = status != null ? status : AccessRequestStatus.PENDING;
    return accessRequestRepository
        .findBySchoolIdAndStatusWithUser(schoolId, effectiveStatus)
        .stream()
        .map(this::toSummary)
        .toList();
  }

  /** Get a single access request by ID. */
  public AccessRequestResponse findById(UUID schoolId, UUID requestId) {
    SchoolAccessRequest request =
        accessRequestRepository
            .findByIdAndSchoolIdWithDetails(requestId, schoolId)
            .orElseThrow(() -> new EntityNotFoundException("AccessRequest", requestId));
    return toResponse(request);
  }

  /**
   * Create a new access request.
   *
   * <p>Business rules:
   *
   * <ul>
   *   <li>User must not already have an active membership in this school
   *   <li>User must not already have a pending request for this school
   * </ul>
   */
  @Transactional
  public AccessRequestResponse create(UUID schoolId, CreateAccessRequestRequest request) {
    UUID userId = authorizationService.getCurrentUser().id();
    return create(schoolId, request, userId);
  }

  /** Package-private overload for testing without security context. */
  @Transactional
  AccessRequestResponse create(UUID schoolId, CreateAccessRequestRequest request, UUID userId) {
    School school =
        schoolRepository
            .findById(schoolId)
            .orElseThrow(() -> new EntityNotFoundException("School", schoolId));

    AppUser user =
        appUserRepository
            .findById(userId)
            .orElseThrow(() -> new EntityNotFoundException("User", userId));

    // Check for existing membership
    if (membershipRepository.existsByUserIdAndSchoolIdAndActiveTrue(userId, schoolId)) {
      throw new ForbiddenOperationException("You already have access to this school");
    }

    // Check for existing pending request
    if (accessRequestRepository.existsByUserIdAndSchoolIdAndStatus(
        userId, schoolId, AccessRequestStatus.PENDING)) {
      throw new ForbiddenOperationException(
          "You already have a pending access request for this school");
    }

    SchoolRole requestedRole =
        request.requestedRole() != null ? request.requestedRole() : SchoolRole.VIEWER;

    SchoolAccessRequest accessRequest =
        new SchoolAccessRequest(user, school, requestedRole, request.message());

    return toResponse(accessRequestRepository.save(accessRequest));
  }

  /**
   * Review an access request (approve or reject).
   *
   * <p>Business rules:
   *
   * <ul>
   *   <li>Request must be in PENDING status
   *   <li>Approving creates a school membership
   *   <li>Admin can override the granted role
   * </ul>
   */
  @Transactional
  public AccessRequestResponse review(
      UUID schoolId, UUID requestId, ReviewAccessRequestRequest request) {
    UUID reviewerId = authorizationService.getCurrentUser().id();
    return review(schoolId, requestId, request, reviewerId);
  }

  /** Package-private overload for testing without security context. */
  @Transactional
  AccessRequestResponse review(
      UUID schoolId, UUID requestId, ReviewAccessRequestRequest request, UUID reviewerId) {
    SchoolAccessRequest accessRequest =
        accessRequestRepository
            .findByIdAndSchoolId(requestId, schoolId)
            .orElseThrow(() -> new EntityNotFoundException("AccessRequest", requestId));

    if (accessRequest.getStatus() != AccessRequestStatus.PENDING) {
      throw new ForbiddenOperationException("This request has already been reviewed");
    }

    AppUser reviewer =
        appUserRepository
            .findById(reviewerId)
            .orElseThrow(() -> new EntityNotFoundException("User", reviewerId));

    if (request.decision() == ReviewDecision.APPROVE) {
      // Determine the role to grant (admin can override)
      SchoolRole grantedRole =
          request.grantedRole() != null ? request.grantedRole() : accessRequest.getRequestedRole();

      // Create membership
      CreateMembershipRequest membershipRequest =
          new CreateMembershipRequest(accessRequest.getUser().getId(), grantedRole, null);
      membershipService.create(schoolId, membershipRequest, reviewerId);

      accessRequest.approve(reviewer, request.responseMessage());
    } else {
      accessRequest.reject(reviewer, request.responseMessage());
    }

    return toResponse(accessRequestRepository.save(accessRequest));
  }

  /**
   * Cancel a pending access request.
   *
   * <p>Business rules:
   *
   * <ul>
   *   <li>Only the requester can cancel their own request
   *   <li>Only PENDING requests can be cancelled
   * </ul>
   */
  @Transactional
  public void cancel(UUID requestId) {
    UUID userId = authorizationService.getCurrentUser().id();
    cancel(requestId, userId);
  }

  /** Package-private overload for testing without security context. */
  @Transactional
  void cancel(UUID requestId, UUID userId) {
    SchoolAccessRequest accessRequest =
        accessRequestRepository
            .findByIdAndUserId(requestId, userId)
            .orElseThrow(() -> new EntityNotFoundException("AccessRequest", requestId));

    if (accessRequest.getStatus() != AccessRequestStatus.PENDING) {
      throw new ForbiddenOperationException("Only pending requests can be cancelled");
    }

    accessRequest.cancel();
    accessRequestRepository.save(accessRequest);
  }

  private AccessRequestSummary toSummary(SchoolAccessRequest r) {
    return new AccessRequestSummary(
        r.getId(),
        r.getUser().getId(),
        r.getUser().getDisplayName(),
        r.getUser().getEmail(),
        r.getRequestedRole(),
        r.getStatus(),
        r.getMessage(),
        r.getCreatedAt());
  }

  private AccessRequestResponse toResponse(SchoolAccessRequest r) {
    String reviewedByName = null;
    UUID reviewedById = null;
    if (r.getReviewedBy() != null) {
      reviewedById = r.getReviewedBy().getId();
      reviewedByName = r.getReviewedBy().getDisplayName();
    }

    return new AccessRequestResponse(
        r.getId(),
        r.getUser().getId(),
        r.getUser().getDisplayName(),
        r.getUser().getEmail(),
        r.getSchool().getId(),
        r.getSchool().getName(),
        r.getRequestedRole(),
        r.getStatus(),
        r.getMessage(),
        r.getResponseMessage(),
        reviewedById,
        reviewedByName,
        r.getReviewedAt(),
        r.getCreatedAt(),
        r.getUpdatedAt());
  }
}
