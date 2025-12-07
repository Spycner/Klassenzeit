package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipService;
import com.klassenzeit.klassenzeit.school.dto.CreateSchoolRequest;
import com.klassenzeit.klassenzeit.school.dto.SchoolResponse;
import com.klassenzeit.klassenzeit.school.dto.SchoolSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateSchoolRequest;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for School operations. */
@Service
@Transactional(readOnly = true)
public class SchoolService {

  private final SchoolRepository schoolRepository;
  private final SchoolSlugHistoryRepository slugHistoryRepository;
  private final SchoolMembershipService membershipService;
  private final AuthorizationService authorizationService;

  public SchoolService(
      SchoolRepository schoolRepository,
      SchoolSlugHistoryRepository slugHistoryRepository,
      SchoolMembershipService membershipService,
      AuthorizationService authorizationService) {
    this.schoolRepository = schoolRepository;
    this.slugHistoryRepository = slugHistoryRepository;
    this.membershipService = membershipService;
    this.authorizationService = authorizationService;
  }

  public List<SchoolSummary> findAll() {
    return schoolRepository.findAll().stream().map(this::toSummary).toList();
  }

  /**
   * Find all schools accessible to the given user.
   *
   * <p>Platform admins can see all schools. Regular users can only see schools where they have a
   * membership.
   *
   * @param currentUser the authenticated user
   * @return list of schools the user can access
   */
  public List<SchoolSummary> findAllForUser(CurrentUser currentUser) {
    if (currentUser.isPlatformAdmin()) {
      return findAll();
    }

    if (currentUser.schoolRoles().isEmpty()) {
      return List.of();
    }

    return schoolRepository.findByIdIn(currentUser.schoolRoles().keySet()).stream()
        .map(this::toSummary)
        .toList();
  }

  public SchoolResponse findById(UUID id) {
    School school =
        schoolRepository.findById(id).orElseThrow(() -> new EntityNotFoundException("School", id));
    return toResponse(school);
  }

  /**
   * Find a school by its slug.
   *
   * <p>If the slug is an old slug that has since been changed, throws SlugRedirectException with
   * the new slug.
   *
   * @param slug the school's URL slug
   * @return the school response
   * @throws EntityNotFoundException if no school exists with this slug (current or historical)
   * @throws SlugRedirectException if the slug has changed, with the new slug
   */
  public SchoolResponse findBySlug(String slug) {
    // First check if this is the current slug
    Optional<School> schoolOpt = schoolRepository.findBySlug(slug);
    if (schoolOpt.isPresent()) {
      return toResponse(schoolOpt.get());
    }

    // Check if this is an old slug that needs redirect
    Optional<SchoolSlugHistory> historyOpt = slugHistoryRepository.findBySlug(slug);
    if (historyOpt.isPresent()) {
      School school = historyOpt.get().getSchool();
      throw new SlugRedirectException(school.getSlug(), school.getId());
    }

    throw new EntityNotFoundException("School", slug);
  }

  /**
   * Find a school by identifier (UUID or slug).
   *
   * <p>Tries to parse as UUID first, then falls back to slug lookup.
   *
   * @param identifier a UUID string or slug
   * @return the school response
   * @throws EntityNotFoundException if no school found
   * @throws SlugRedirectException if accessing via old slug
   */
  public SchoolResponse findByIdentifier(String identifier) {
    try {
      UUID id = UUID.fromString(identifier);
      return findById(id);
    } catch (IllegalArgumentException e) {
      // Not a UUID, treat as slug
      return findBySlug(identifier);
    }
  }

  /**
   * Create a new school with an initial school administrator.
   *
   * <p>Business rules:
   *
   * <ul>
   *   <li>The initial admin user must exist
   *   <li>The school is created with the specified admin as SCHOOL_ADMIN
   * </ul>
   */
  @Transactional
  public SchoolResponse create(CreateSchoolRequest request) {
    // Clear any existing slug history to allow reuse of old slugs
    slugHistoryRepository.deleteBySlug(request.slug());

    School school = new School();
    school.setName(request.name());
    school.setSlug(request.slug());
    school.setSchoolType(request.schoolType());
    school.setMinGrade(request.minGrade());
    school.setMaxGrade(request.maxGrade());
    if (request.timezone() != null) {
      school.setTimezone(request.timezone());
    }
    if (request.settings() != null) {
      school.setSettings(request.settings());
    }

    School savedSchool = schoolRepository.save(school);

    // Assign the initial school admin
    UUID currentUserId = authorizationService.getCurrentUser().id();
    membershipService.assignSchoolAdmin(
        savedSchool.getId(), request.initialAdminUserId(), currentUserId);

    return toResponse(savedSchool);
  }

  @Transactional
  public SchoolResponse update(UUID id, UpdateSchoolRequest request) {
    School school =
        schoolRepository.findById(id).orElseThrow(() -> new EntityNotFoundException("School", id));

    if (request.name() != null) {
      school.setName(request.name());
    }
    if (request.slug() != null && !request.slug().equals(school.getSlug())) {
      String oldSlug = school.getSlug();
      String newSlug = request.slug();

      // If new slug exists in history, remove it (allowing slug reuse)
      slugHistoryRepository.deleteBySlug(newSlug);

      // Save old slug to history for redirects
      slugHistoryRepository.save(new SchoolSlugHistory(school, oldSlug));

      school.setSlug(newSlug);
    }
    if (request.schoolType() != null) {
      school.setSchoolType(request.schoolType());
    }
    if (request.minGrade() != null) {
      school.setMinGrade(request.minGrade());
    }
    if (request.maxGrade() != null) {
      school.setMaxGrade(request.maxGrade());
    }
    if (request.timezone() != null) {
      school.setTimezone(request.timezone());
    }
    if (request.settings() != null) {
      school.setSettings(request.settings());
    }

    return toResponse(schoolRepository.save(school));
  }

  @Transactional
  public void delete(UUID id) {
    School school =
        schoolRepository.findById(id).orElseThrow(() -> new EntityNotFoundException("School", id));
    schoolRepository.delete(school);
  }

  private SchoolResponse toResponse(School s) {
    return new SchoolResponse(
        s.getId(),
        s.getName(),
        s.getSlug(),
        s.getSchoolType(),
        s.getMinGrade(),
        s.getMaxGrade(),
        s.getTimezone(),
        s.getSettings(),
        s.getCreatedAt(),
        s.getUpdatedAt());
  }

  private SchoolSummary toSummary(School s) {
    return new SchoolSummary(s.getId(), s.getName(), s.getSlug(), s.getSchoolType());
  }
}
