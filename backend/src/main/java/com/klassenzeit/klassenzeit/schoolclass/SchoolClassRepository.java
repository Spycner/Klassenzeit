package com.klassenzeit.klassenzeit.schoolclass;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SchoolClassRepository extends JpaRepository<SchoolClass, UUID> {

  List<SchoolClass> findBySchoolId(UUID schoolId);

  List<SchoolClass> findBySchoolIdAndIsActiveTrue(UUID schoolId);

  List<SchoolClass> findBySchoolIdAndIsActiveFalse(UUID schoolId);

  List<SchoolClass> findBySchoolIdAndGradeLevel(UUID schoolId, Short gradeLevel);

  Optional<SchoolClass> findBySchoolIdAndName(UUID schoolId, String name);

  boolean existsBySchoolIdAndName(UUID schoolId, String name);

  List<SchoolClass> findByClassTeacherId(UUID teacherId);

  List<SchoolClass> findBySchoolIdAndIsActiveTrueOrderByGradeLevelAscNameAsc(UUID schoolId);

  List<SchoolClass> findBySchoolIdAndStudentCountGreaterThan(UUID schoolId, Integer minStudents);
}
