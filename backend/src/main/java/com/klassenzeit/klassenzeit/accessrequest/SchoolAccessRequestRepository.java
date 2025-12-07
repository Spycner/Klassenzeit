package com.klassenzeit.klassenzeit.accessrequest;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Repository for SchoolAccessRequest entities. */
@Repository
public interface SchoolAccessRequestRepository extends JpaRepository<SchoolAccessRequest, UUID> {

  List<SchoolAccessRequest> findBySchoolId(UUID schoolId);

  List<SchoolAccessRequest> findBySchoolIdAndStatus(UUID schoolId, AccessRequestStatus status);

  boolean existsByUserIdAndSchoolIdAndStatus(
      UUID userId, UUID schoolId, AccessRequestStatus status);

  Optional<SchoolAccessRequest> findByIdAndUserId(UUID id, UUID userId);

  Optional<SchoolAccessRequest> findByIdAndSchoolId(UUID id, UUID schoolId);

  @Query(
      "SELECT r FROM SchoolAccessRequest r "
          + "JOIN FETCH r.user "
          + "JOIN FETCH r.school "
          + "LEFT JOIN FETCH r.reviewedBy "
          + "WHERE r.id = :id AND r.school.id = :schoolId")
  Optional<SchoolAccessRequest> findByIdAndSchoolIdWithDetails(
      @Param("id") UUID id, @Param("schoolId") UUID schoolId);

  @Query(
      "SELECT r FROM SchoolAccessRequest r "
          + "JOIN FETCH r.user "
          + "WHERE r.school.id = :schoolId AND r.status = :status")
  List<SchoolAccessRequest> findBySchoolIdAndStatusWithUser(
      UUID schoolId, AccessRequestStatus status);
}
