package com.klassenzeit.klassenzeit.school;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SchoolYearRepository extends JpaRepository<SchoolYear, UUID> {

  List<SchoolYear> findBySchoolId(UUID schoolId);

  Optional<SchoolYear> findBySchoolIdAndIsCurrentTrue(UUID schoolId);

  List<SchoolYear> findBySchoolIdOrderByStartDateDesc(UUID schoolId);

  Optional<SchoolYear> findBySchoolIdAndName(UUID schoolId, String name);

  boolean existsBySchoolIdAndName(UUID schoolId, String name);
}
