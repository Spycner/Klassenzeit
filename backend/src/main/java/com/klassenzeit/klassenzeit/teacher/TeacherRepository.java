package com.klassenzeit.klassenzeit.teacher;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeacherRepository extends JpaRepository<Teacher, UUID> {

  List<Teacher> findBySchoolId(UUID schoolId);

  List<Teacher> findBySchoolIdAndIsActiveTrue(UUID schoolId);

  List<Teacher> findBySchoolIdAndIsActiveFalse(UUID schoolId);

  Optional<Teacher> findBySchoolIdAndAbbreviation(UUID schoolId, String abbreviation);

  boolean existsBySchoolIdAndAbbreviation(UUID schoolId, String abbreviation);

  List<Teacher> findBySchoolIdAndLastNameContainingIgnoreCase(UUID schoolId, String lastName);

  List<Teacher> findBySchoolIdAndFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(
      UUID schoolId, String firstName, String lastName);

  Optional<Teacher> findBySchoolIdAndEmail(UUID schoolId, String email);

  List<Teacher> findBySchoolIdAndIsActiveTrueOrderByLastNameAscFirstNameAsc(UUID schoolId);
}
