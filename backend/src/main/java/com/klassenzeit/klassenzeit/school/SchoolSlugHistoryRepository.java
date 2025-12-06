package com.klassenzeit.klassenzeit.school;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface SchoolSlugHistoryRepository extends JpaRepository<SchoolSlugHistory, UUID> {

  Optional<SchoolSlugHistory> findBySlug(String slug);

  boolean existsBySlug(String slug);

  List<SchoolSlugHistory> findBySchoolId(UUID schoolId);

  @Modifying
  @Query("DELETE FROM SchoolSlugHistory h WHERE h.slug = :slug")
  void deleteBySlug(String slug);
}
