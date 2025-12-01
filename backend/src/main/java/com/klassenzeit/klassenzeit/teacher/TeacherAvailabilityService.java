package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.school.TermRepository;
import com.klassenzeit.klassenzeit.teacher.dto.AvailabilityResponse;
import com.klassenzeit.klassenzeit.teacher.dto.AvailabilitySummary;
import com.klassenzeit.klassenzeit.teacher.dto.CreateAvailabilityRequest;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateAvailabilityRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for TeacherAvailability operations. */
@Service
@Transactional(readOnly = true)
public class TeacherAvailabilityService {

  private final TeacherAvailabilityRepository availabilityRepository;
  private final TeacherRepository teacherRepository;
  private final TermRepository termRepository;

  public TeacherAvailabilityService(
      TeacherAvailabilityRepository availabilityRepository,
      TeacherRepository teacherRepository,
      TermRepository termRepository) {
    this.availabilityRepository = availabilityRepository;
    this.teacherRepository = teacherRepository;
    this.termRepository = termRepository;
  }

  public List<AvailabilitySummary> findAllByTeacher(UUID schoolId, UUID teacherId) {
    validateTeacher(schoolId, teacherId);
    return availabilityRepository.findByTeacherId(teacherId).stream().map(this::toSummary).toList();
  }

  public AvailabilityResponse findById(UUID schoolId, UUID teacherId, UUID id) {
    validateTeacher(schoolId, teacherId);
    TeacherAvailability availability =
        availabilityRepository
            .findById(id)
            .filter(a -> a.getTeacher().getId().equals(teacherId))
            .orElseThrow(() -> new EntityNotFoundException("TeacherAvailability", id));
    return toResponse(availability);
  }

  @Transactional
  public AvailabilityResponse create(
      UUID schoolId, UUID teacherId, CreateAvailabilityRequest request) {
    Teacher teacher = validateTeacher(schoolId, teacherId);

    TeacherAvailability availability = new TeacherAvailability();
    availability.setTeacher(teacher);
    availability.setDayOfWeek(request.dayOfWeek());
    availability.setPeriod(request.period());
    availability.setAvailabilityType(request.availabilityType());
    availability.setReason(request.reason());

    if (request.termId() != null) {
      Term term =
          termRepository
              .findById(request.termId())
              .orElseThrow(() -> new EntityNotFoundException("Term", request.termId()));
      if (!term.getSchoolYear().getSchool().getId().equals(schoolId)) {
        throw new EntityNotFoundException("Term", request.termId());
      }
      availability.setTerm(term);
    }

    return toResponse(availabilityRepository.save(availability));
  }

  @Transactional
  public AvailabilityResponse update(
      UUID schoolId, UUID teacherId, UUID id, UpdateAvailabilityRequest request) {
    validateTeacher(schoolId, teacherId);
    TeacherAvailability availability =
        availabilityRepository
            .findById(id)
            .filter(a -> a.getTeacher().getId().equals(teacherId))
            .orElseThrow(() -> new EntityNotFoundException("TeacherAvailability", id));

    if (request.dayOfWeek() != null) {
      availability.setDayOfWeek(request.dayOfWeek());
    }
    if (request.period() != null) {
      availability.setPeriod(request.period());
    }
    if (request.availabilityType() != null) {
      availability.setAvailabilityType(request.availabilityType());
    }
    if (request.reason() != null) {
      availability.setReason(request.reason());
    }

    return toResponse(availabilityRepository.save(availability));
  }

  @Transactional
  public void delete(UUID schoolId, UUID teacherId, UUID id) {
    validateTeacher(schoolId, teacherId);
    TeacherAvailability availability =
        availabilityRepository
            .findById(id)
            .filter(a -> a.getTeacher().getId().equals(teacherId))
            .orElseThrow(() -> new EntityNotFoundException("TeacherAvailability", id));
    availabilityRepository.delete(availability);
  }

  private Teacher validateTeacher(UUID schoolId, UUID teacherId) {
    return teacherRepository
        .findById(teacherId)
        .filter(t -> t.getSchool().getId().equals(schoolId))
        .orElseThrow(() -> new EntityNotFoundException("Teacher", teacherId));
  }

  private AvailabilityResponse toResponse(TeacherAvailability a) {
    Term term = a.getTerm();
    return new AvailabilityResponse(
        a.getId(),
        term != null ? term.getId() : null,
        term != null ? term.getName() : null,
        a.getDayOfWeek(),
        a.getPeriod(),
        a.getAvailabilityType(),
        a.getReason(),
        a.isGlobal(),
        a.getCreatedAt(),
        a.getUpdatedAt());
  }

  private AvailabilitySummary toSummary(TeacherAvailability a) {
    return new AvailabilitySummary(
        a.getId(), a.getDayOfWeek(), a.getPeriod(), a.getAvailabilityType(), a.isGlobal());
  }
}
