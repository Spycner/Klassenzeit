package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolRepository;
import com.klassenzeit.klassenzeit.teacher.dto.CreateTeacherRequest;
import com.klassenzeit.klassenzeit.teacher.dto.TeacherResponse;
import com.klassenzeit.klassenzeit.teacher.dto.TeacherSummary;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateTeacherRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for Teacher operations. */
@Service
@Transactional(readOnly = true)
public class TeacherService {

  private final TeacherRepository teacherRepository;
  private final SchoolRepository schoolRepository;

  public TeacherService(TeacherRepository teacherRepository, SchoolRepository schoolRepository) {
    this.teacherRepository = teacherRepository;
    this.schoolRepository = schoolRepository;
  }

  public List<TeacherSummary> findAllBySchool(UUID schoolId) {
    return teacherRepository.findBySchoolId(schoolId).stream().map(this::toSummary).toList();
  }

  public TeacherResponse findById(UUID schoolId, UUID id) {
    Teacher teacher =
        teacherRepository
            .findById(id)
            .filter(t -> t.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Teacher", id));
    return toResponse(teacher);
  }

  @Transactional
  public TeacherResponse create(UUID schoolId, CreateTeacherRequest request) {
    School school =
        schoolRepository
            .findById(schoolId)
            .orElseThrow(() -> new EntityNotFoundException("School", schoolId));

    Teacher teacher = new Teacher();
    teacher.setSchool(school);
    teacher.setFirstName(request.firstName());
    teacher.setLastName(request.lastName());
    teacher.setEmail(request.email());
    teacher.setAbbreviation(request.abbreviation());
    if (request.maxHoursPerWeek() != null) {
      teacher.setMaxHoursPerWeek(request.maxHoursPerWeek());
    }
    if (request.isPartTime() != null) {
      teacher.setPartTime(request.isPartTime());
    }

    return toResponse(teacherRepository.save(teacher));
  }

  @Transactional
  public TeacherResponse update(UUID schoolId, UUID id, UpdateTeacherRequest request) {
    Teacher teacher =
        teacherRepository
            .findById(id)
            .filter(t -> t.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Teacher", id));

    if (request.firstName() != null) {
      teacher.setFirstName(request.firstName());
    }
    if (request.lastName() != null) {
      teacher.setLastName(request.lastName());
    }
    if (request.email() != null) {
      teacher.setEmail(request.email());
    }
    if (request.abbreviation() != null) {
      teacher.setAbbreviation(request.abbreviation());
    }
    if (request.maxHoursPerWeek() != null) {
      teacher.setMaxHoursPerWeek(request.maxHoursPerWeek());
    }
    if (request.isPartTime() != null) {
      teacher.setPartTime(request.isPartTime());
    }
    if (request.isActive() != null) {
      teacher.setActive(request.isActive());
    }

    return toResponse(teacherRepository.save(teacher));
  }

  @Transactional
  public void delete(UUID schoolId, UUID id) {
    Teacher teacher =
        teacherRepository
            .findById(id)
            .filter(t -> t.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Teacher", id));
    teacher.setActive(false);
    teacherRepository.save(teacher);
  }

  private TeacherResponse toResponse(Teacher t) {
    return new TeacherResponse(
        t.getId(),
        t.getFirstName(),
        t.getLastName(),
        t.getEmail(),
        t.getAbbreviation(),
        t.getMaxHoursPerWeek(),
        t.isPartTime(),
        t.isActive(),
        t.getCreatedAt(),
        t.getUpdatedAt(),
        t.getVersion());
  }

  private TeacherSummary toSummary(Teacher t) {
    return new TeacherSummary(
        t.getId(), t.getFirstName(), t.getLastName(), t.getAbbreviation(), t.isActive());
  }
}
