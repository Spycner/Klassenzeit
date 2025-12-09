package com.klassenzeit.klassenzeit.schoolclass;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolRepository;
import com.klassenzeit.klassenzeit.schoolclass.dto.CreateSchoolClassRequest;
import com.klassenzeit.klassenzeit.schoolclass.dto.SchoolClassResponse;
import com.klassenzeit.klassenzeit.schoolclass.dto.SchoolClassSummary;
import com.klassenzeit.klassenzeit.schoolclass.dto.UpdateSchoolClassRequest;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.teacher.TeacherRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for SchoolClass operations. */
@Service
@Transactional(readOnly = true)
public class SchoolClassService {

  private final SchoolClassRepository schoolClassRepository;
  private final SchoolRepository schoolRepository;
  private final TeacherRepository teacherRepository;

  public SchoolClassService(
      SchoolClassRepository schoolClassRepository,
      SchoolRepository schoolRepository,
      TeacherRepository teacherRepository) {
    this.schoolClassRepository = schoolClassRepository;
    this.schoolRepository = schoolRepository;
    this.teacherRepository = teacherRepository;
  }

  public List<SchoolClassSummary> findAllBySchool(UUID schoolId) {
    return schoolClassRepository.findBySchoolId(schoolId).stream()
        .map(SchoolClassSummary::fromEntity)
        .toList();
  }

  public SchoolClassResponse findById(UUID schoolId, UUID id) {
    SchoolClass schoolClass =
        schoolClassRepository
            .findById(id)
            .filter(c -> c.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("SchoolClass", id));
    return toResponse(schoolClass);
  }

  @Transactional
  public SchoolClassResponse create(UUID schoolId, CreateSchoolClassRequest request) {
    School school =
        schoolRepository
            .findById(schoolId)
            .orElseThrow(() -> new EntityNotFoundException("School", schoolId));

    SchoolClass schoolClass = new SchoolClass();
    schoolClass.setSchool(school);
    schoolClass.setName(request.name());
    schoolClass.setGradeLevel(request.gradeLevel());
    schoolClass.setStudentCount(request.studentCount());

    if (request.classTeacherId() != null) {
      Teacher teacher =
          teacherRepository
              .findById(request.classTeacherId())
              .filter(t -> t.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("Teacher", request.classTeacherId()));
      schoolClass.setClassTeacher(teacher);
    }

    return toResponse(schoolClassRepository.save(schoolClass));
  }

  @Transactional
  public SchoolClassResponse update(UUID schoolId, UUID id, UpdateSchoolClassRequest request) {
    SchoolClass schoolClass =
        schoolClassRepository
            .findById(id)
            .filter(c -> c.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("SchoolClass", id));

    if (request.name() != null) {
      schoolClass.setName(request.name());
    }
    if (request.gradeLevel() != null) {
      schoolClass.setGradeLevel(request.gradeLevel());
    }
    if (request.studentCount() != null) {
      schoolClass.setStudentCount(request.studentCount());
    }
    if (request.isActive() != null) {
      schoolClass.setActive(request.isActive());
    }

    // Handle classTeacherId - clearClassTeacher=true explicitly removes the teacher
    if (Boolean.TRUE.equals(request.clearClassTeacher())) {
      schoolClass.setClassTeacher(null);
    } else if (request.classTeacherId() != null) {
      Teacher teacher =
          teacherRepository
              .findById(request.classTeacherId())
              .filter(t -> t.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("Teacher", request.classTeacherId()));
      schoolClass.setClassTeacher(teacher);
    }

    return toResponse(schoolClassRepository.save(schoolClass));
  }

  @Transactional
  public void delete(UUID schoolId, UUID id) {
    SchoolClass schoolClass =
        schoolClassRepository
            .findById(id)
            .filter(c -> c.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("SchoolClass", id));
    schoolClass.setActive(false);
    schoolClassRepository.save(schoolClass);
  }

  private SchoolClassResponse toResponse(SchoolClass c) {
    Teacher classTeacher = c.getClassTeacher();
    return new SchoolClassResponse(
        c.getId(),
        c.getName(),
        c.getGradeLevel(),
        c.getStudentCount(),
        classTeacher != null ? classTeacher.getId() : null,
        classTeacher != null ? classTeacher.getFullName() : null,
        c.isActive(),
        c.getCreatedAt(),
        c.getUpdatedAt(),
        c.getVersion());
  }
}
