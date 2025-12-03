package com.klassenzeit.klassenzeit.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Repository for AppUser entities. */
@Repository
public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

  Optional<AppUser> findByKeycloakId(String keycloakId);

  Optional<AppUser> findByEmail(String email);

  boolean existsByEmail(String email);
}
