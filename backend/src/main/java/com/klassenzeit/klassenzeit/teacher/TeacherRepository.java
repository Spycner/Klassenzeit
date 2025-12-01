package com.klassenzeit.klassenzeit.teacher;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

  /**
   * Loads teachers with qualifications and subjects for timetabling. The availabilities are loaded
   * separately to avoid MultipleBagFetchException.
   */
  @Query(
      "SELECT DISTINCT t FROM Teacher t "
          + "LEFT JOIN FETCH t.qualifications q "
          + "LEFT JOIN FETCH q.subject "
          + "WHERE t.school.id = :schoolId")
  List<Teacher> findBySchoolIdWithQualifications(@Param("schoolId") UUID schoolId);

  /**
   * Loads teachers with availabilities for timetabling. Used after fetching qualifications to avoid
   * MultipleBagFetchException.
   */
  @Query(
      "SELECT DISTINCT t FROM Teacher t "
          + "LEFT JOIN FETCH t.availabilities "
          + "WHERE t.school.id = :schoolId")
  List<Teacher> findBySchoolIdWithAvailabilities(@Param("schoolId") UUID schoolId);
}
