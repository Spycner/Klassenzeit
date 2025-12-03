package com.klassenzeit.klassenzeit.membership;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

/** Repository for SchoolMembership entities. */
@Repository
public interface SchoolMembershipRepository extends JpaRepository<SchoolMembership, UUID> {

  List<SchoolMembership> findByUserIdAndActiveTrue(UUID userId);

  List<SchoolMembership> findBySchoolIdAndActiveTrue(UUID schoolId);

  Optional<SchoolMembership> findByUserIdAndSchoolId(UUID userId, UUID schoolId);

  boolean existsByUserIdAndSchoolIdAndActiveTrue(UUID userId, UUID schoolId);

  @Query(
      "SELECT m FROM SchoolMembership m "
          + "JOIN FETCH m.school "
          + "WHERE m.user.id = :userId AND m.active = true")
  List<SchoolMembership> findByUserIdWithSchool(UUID userId);
}
