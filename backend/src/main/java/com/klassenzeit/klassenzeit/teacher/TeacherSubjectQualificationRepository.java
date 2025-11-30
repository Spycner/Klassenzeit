package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.common.QualificationLevel;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

public interface TeacherSubjectQualificationRepository
    extends JpaRepository<TeacherSubjectQualification, UUID> {

  List<TeacherSubjectQualification> findByTeacherId(UUID teacherId);

  List<TeacherSubjectQualification> findBySubjectId(UUID subjectId);

  Optional<TeacherSubjectQualification> findByTeacherIdAndSubjectId(UUID teacherId, UUID subjectId);

  boolean existsByTeacherIdAndSubjectId(UUID teacherId, UUID subjectId);

  List<TeacherSubjectQualification> findByTeacherIdAndQualificationLevel(
      UUID teacherId, QualificationLevel level);

  @Modifying
  @Transactional
  void deleteByTeacherIdAndSubjectId(UUID teacherId, UUID subjectId);
}
