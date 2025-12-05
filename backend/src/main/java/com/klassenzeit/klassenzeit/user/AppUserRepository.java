package com.klassenzeit.klassenzeit.user;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Repository for AppUser entities. */
@Repository
public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

  Optional<AppUser> findByKeycloakId(String keycloakId);

  /** Find by keycloak ID with pessimistic write lock to prevent concurrent modifications. */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT u FROM AppUser u WHERE u.keycloakId = :keycloakId")
  Optional<AppUser> findByKeycloakIdForUpdate(@Param("keycloakId") String keycloakId);

  Optional<AppUser> findByEmail(String email);

  boolean existsByEmail(String email);

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
