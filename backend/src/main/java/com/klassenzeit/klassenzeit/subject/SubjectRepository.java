package com.klassenzeit.klassenzeit.subject;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubjectRepository extends JpaRepository<Subject, UUID> {

  List<Subject> findBySchoolId(UUID schoolId);

  Optional<Subject> findBySchoolIdAndAbbreviation(UUID schoolId, String abbreviation);

  boolean existsBySchoolIdAndAbbreviation(UUID schoolId, String abbreviation);

  List<Subject> findBySchoolIdOrderByNameAsc(UUID schoolId);

  List<Subject> findBySchoolIdAndNameContainingIgnoreCase(UUID schoolId, String name);
}
