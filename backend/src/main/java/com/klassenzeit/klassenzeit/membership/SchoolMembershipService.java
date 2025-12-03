package com.klassenzeit.klassenzeit.membership;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.membership.dto.CreateMembershipRequest;
import com.klassenzeit.klassenzeit.membership.dto.MembershipResponse;
import com.klassenzeit.klassenzeit.membership.dto.MembershipSummary;
import com.klassenzeit.klassenzeit.membership.dto.UpdateMembershipRequest;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolRepository;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.teacher.TeacherRepository;
import com.klassenzeit.klassenzeit.user.AppUser;
import com.klassenzeit.klassenzeit.user.AppUserRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for SchoolMembership operations. */
@Service
@Transactional(readOnly = true)
public class SchoolMembershipService {

  /** Minimum number of school admins required (orphan protection). */
  private static final long MIN_ADMIN_COUNT = 1;

  private final SchoolMembershipRepository membershipRepository;
  private final SchoolRepository schoolRepository;
  private final AppUserRepository appUserRepository;
  private final TeacherRepository teacherRepository;
  private final AuthorizationService authorizationService;

  public SchoolMembershipService(
      SchoolMembershipRepository membershipRepository,
      SchoolRepository schoolRepository,
      AppUserRepository appUserRepository,
      TeacherRepository teacherRepository,
      AuthorizationService authorizationService) {
    this.membershipRepository = membershipRepository;
    this.schoolRepository = schoolRepository;
    this.appUserRepository = appUserRepository;
    this.teacherRepository = teacherRepository;
    this.authorizationService = authorizationService;
  }

  /** List all active members of a school. */
  public List<MembershipSummary> findAllBySchool(UUID schoolId) {
    return membershipRepository.findBySchoolIdAndActiveTrue(schoolId).stream()
        .map(this::toSummary)
        .toList();
  }

  /** Get a single membership by ID. */
  public MembershipResponse findById(UUID schoolId, UUID membershipId) {
    SchoolMembership membership =
        membershipRepository
            .findById(membershipId)
            .filter(m -> m.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Membership", membershipId));
    return toResponse(membership);
  }

  /**
   * Add a user to a school with a specific role.
   *
   * <p>Business rules:
   *
   * <ul>
   *   <li>User must exist
   *   <li>User must not already have an active membership in this school
   *   <li>If linkedTeacherId provided, teacher must belong to same school
   * </ul>
   */
  @Transactional
  public MembershipResponse create(UUID schoolId, CreateMembershipRequest request) {
    return create(schoolId, request, authorizationService.getCurrentUser().id());
  }

  /** Package-private overload for testing without security context. */
  @Transactional
  MembershipResponse create(UUID schoolId, CreateMembershipRequest request, UUID grantedById) {
    School school =
        schoolRepository
            .findById(schoolId)
            .orElseThrow(() -> new EntityNotFoundException("School", schoolId));

    AppUser user =
        appUserRepository
            .findById(request.userId())
            .orElseThrow(() -> new EntityNotFoundException("User", request.userId()));

    // Check for existing membership
    if (membershipRepository.existsByUserIdAndSchoolIdAndActiveTrue(request.userId(), schoolId)) {
      throw new ForbiddenOperationException("User already has an active membership in this school");
    }

    AppUser grantedBy =
        grantedById != null ? appUserRepository.findById(grantedById).orElse(null) : null;

    SchoolMembership membership = new SchoolMembership(user, school, request.role(), grantedBy);

    // Link to teacher if provided
    if (request.linkedTeacherId() != null) {
      Teacher teacher =
          teacherRepository
              .findById(request.linkedTeacherId())
              .filter(t -> t.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("Teacher", request.linkedTeacherId()));
      membership.setLinkedTeacher(teacher);
    }

    return toResponse(membershipRepository.save(membership));
  }

  /**
   * Update a membership's role or linked teacher.
   *
   * <p>Business rules:
   *
   * <ul>
   *   <li>Cannot demote the last SCHOOL_ADMIN (orphan protection)
   * </ul>
   */
  @Transactional
  public MembershipResponse update(
      UUID schoolId, UUID membershipId, UpdateMembershipRequest request) {
    SchoolMembership membership =
        membershipRepository
            .findById(membershipId)
            .filter(m -> m.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Membership", membershipId));

    // Orphan protection: cannot demote last admin
    if (membership.getRole() == SchoolRole.SCHOOL_ADMIN
        && request.role() != SchoolRole.SCHOOL_ADMIN) {
      long adminCount =
          membershipRepository.countBySchoolIdAndRoleAndActiveTrue(
              schoolId, SchoolRole.SCHOOL_ADMIN);
      if (adminCount <= MIN_ADMIN_COUNT) {
        throw new ForbiddenOperationException("Cannot demote the last school administrator");
      }
    }

    membership.setRole(request.role());

    // Update linked teacher
    if (request.linkedTeacherId() != null) {
      Teacher teacher =
          teacherRepository
              .findById(request.linkedTeacherId())
              .filter(t -> t.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("Teacher", request.linkedTeacherId()));
      membership.setLinkedTeacher(teacher);
    } else {
      membership.setLinkedTeacher(null);
    }

    return toResponse(membershipRepository.save(membership));
  }

  /**
   * Remove a member from a school (soft delete).
   *
   * <p>Business rules:
   *
   * <ul>
   *   <li>Cannot remove the last SCHOOL_ADMIN (orphan protection)
   *   <li>Self-removal allowed if not the last admin
   * </ul>
   */
  @Transactional
  public void delete(UUID schoolId, UUID membershipId) {
    delete(schoolId, membershipId, authorizationService.getCurrentUser().id());
  }

  /** Package-private overload for testing without security context. */
  @Transactional
  void delete(UUID schoolId, UUID membershipId, UUID currentUserId) {
    SchoolMembership membership =
        membershipRepository
            .findById(membershipId)
            .filter(m -> m.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Membership", membershipId));

    // Orphan protection
    if (membership.getRole() == SchoolRole.SCHOOL_ADMIN) {
      long adminCount =
          membershipRepository.countBySchoolIdAndRoleAndActiveTrue(
              schoolId, SchoolRole.SCHOOL_ADMIN);
      if (adminCount <= MIN_ADMIN_COUNT) {
        throw new ForbiddenOperationException("Cannot remove the last school administrator");
      }
    }

    membership.setActive(false);
    membershipRepository.save(membership);
  }

  private MembershipSummary toSummary(SchoolMembership m) {
    return new MembershipSummary(
        m.getId(),
        m.getUser().getId(),
        m.getUser().getDisplayName(),
        m.getUser().getEmail(),
        m.getRole(),
        m.isActive());
  }

  private MembershipResponse toResponse(SchoolMembership m) {
    String linkedTeacherName = null;
    UUID linkedTeacherId = null;
    if (m.getLinkedTeacher() != null) {
      linkedTeacherId = m.getLinkedTeacher().getId();
      linkedTeacherName =
          m.getLinkedTeacher().getFirstName() + " " + m.getLinkedTeacher().getLastName();
    }

    String grantedByName = null;
    UUID grantedById = null;
    if (m.getGrantedBy() != null) {
      grantedById = m.getGrantedBy().getId();
      grantedByName = m.getGrantedBy().getDisplayName();
    }

    return new MembershipResponse(
        m.getId(),
        m.getUser().getId(),
        m.getUser().getDisplayName(),
        m.getUser().getEmail(),
        m.getSchool().getId(),
        m.getRole(),
        linkedTeacherId,
        linkedTeacherName,
        m.isActive(),
        grantedById,
        grantedByName,
        m.getGrantedAt(),
        m.getCreatedAt(),
        m.getUpdatedAt());
  }
}
