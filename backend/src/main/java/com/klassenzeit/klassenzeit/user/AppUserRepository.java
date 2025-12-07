package com.klassenzeit.klassenzeit.user;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Repository for AppUser entities. */
@Repository
public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

  Optional<AppUser> findByKeycloakId(String keycloakId);

  Optional<AppUser> findByEmail(String email);

  boolean existsByEmail(String email);

  /**
   * Search for users by email or display name using case-insensitive partial matching. Results are
   * ordered by email for consistency.
   */
  @Query(
      """
      SELECT u FROM AppUser u
      WHERE LOWER(u.email) LIKE LOWER(CONCAT('%', :query, '%'))
         OR LOWER(u.displayName) LIKE LOWER(CONCAT('%', :query, '%'))
      ORDER BY u.email
      """)
  List<AppUser> searchByEmailOrDisplayName(@Param("query") String query, Pageable pageable);

  /**
   * Update login-related fields atomically. This bypasses optimistic locking since we don't care
   * about version conflicts for login updates.
   */
  @Modifying
  @Query(
      """
      UPDATE AppUser u SET
        u.displayName = :displayName,
        u.platformAdmin = :platformAdmin,
        u.lastLoginAt = :lastLoginAt,
        u.updatedAt = :lastLoginAt
      WHERE u.keycloakId = :keycloakId
      """)
  int updateLoginInfo(
      @Param("keycloakId") String keycloakId,
      @Param("displayName") String displayName,
      @Param("platformAdmin") boolean platformAdmin,
      @Param("lastLoginAt") Instant lastLoginAt);
}
