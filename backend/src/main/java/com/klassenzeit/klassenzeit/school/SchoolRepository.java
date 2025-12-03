package com.klassenzeit.klassenzeit.school;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SchoolRepository extends JpaRepository<School, UUID> {

  Optional<School> findBySlug(String slug);

  boolean existsBySlug(String slug);

  List<School> findByNameContainingIgnoreCase(String name);

  List<School> findBySchoolType(String schoolType);

  List<School> findByIdIn(Collection<UUID> ids);
}
