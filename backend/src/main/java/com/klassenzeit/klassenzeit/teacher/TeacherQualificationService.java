package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.subject.SubjectRepository;
import com.klassenzeit.klassenzeit.teacher.dto.CreateQualificationRequest;
import com.klassenzeit.klassenzeit.teacher.dto.QualificationResponse;
import com.klassenzeit.klassenzeit.teacher.dto.QualificationSummary;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateQualificationRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for TeacherSubjectQualification operations. */
@Service
@Transactional(readOnly = true)
public class TeacherQualificationService {

  private final TeacherSubjectQualificationRepository qualificationRepository;
  private final TeacherRepository teacherRepository;
  private final SubjectRepository subjectRepository;

  public TeacherQualificationService(
      TeacherSubjectQualificationRepository qualificationRepository,
      TeacherRepository teacherRepository,
      SubjectRepository subjectRepository) {
    this.qualificationRepository = qualificationRepository;
    this.teacherRepository = teacherRepository;
    this.subjectRepository = subjectRepository;
  }

  public List<QualificationSummary> findAllByTeacher(UUID schoolId, UUID teacherId) {
    validateTeacher(schoolId, teacherId);
    return qualificationRepository.findByTeacherId(teacherId).stream()
        .map(this::toSummary)
        .toList();
  }

  public QualificationResponse findById(UUID schoolId, UUID teacherId, UUID id) {
    validateTeacher(schoolId, teacherId);
    TeacherSubjectQualification qualification =
        qualificationRepository
            .findById(id)
            .filter(q -> q.getTeacher().getId().equals(teacherId))
            .orElseThrow(() -> new EntityNotFoundException("TeacherSubjectQualification", id));
    return toResponse(qualification);
  }

  @Transactional
  public QualificationResponse create(
      UUID schoolId, UUID teacherId, CreateQualificationRequest request) {
    Teacher teacher = validateTeacher(schoolId, teacherId);

    Subject subject =
        subjectRepository
            .findById(request.subjectId())
            .filter(s -> s.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Subject", request.subjectId()));

    TeacherSubjectQualification qualification = new TeacherSubjectQualification();
    qualification.setTeacher(teacher);
    qualification.setSubject(subject);
    qualification.setQualificationLevel(request.qualificationLevel());
    qualification.setCanTeachGrades(request.canTeachGrades());
    qualification.setMaxHoursPerWeek(request.maxHoursPerWeek());

    return toResponse(qualificationRepository.save(qualification));
  }

  @Transactional
  public QualificationResponse update(
      UUID schoolId, UUID teacherId, UUID id, UpdateQualificationRequest request) {
    validateTeacher(schoolId, teacherId);
    TeacherSubjectQualification qualification =
        qualificationRepository
            .findById(id)
            .filter(q -> q.getTeacher().getId().equals(teacherId))
            .orElseThrow(() -> new EntityNotFoundException("TeacherSubjectQualification", id));

    if (request.qualificationLevel() != null) {
      qualification.setQualificationLevel(request.qualificationLevel());
    }
    if (request.canTeachGrades() != null) {
      qualification.setCanTeachGrades(request.canTeachGrades());
    }
    if (request.maxHoursPerWeek() != null) {
      qualification.setMaxHoursPerWeek(request.maxHoursPerWeek());
    }

    return toResponse(qualificationRepository.save(qualification));
  }

  @Transactional
  public void delete(UUID schoolId, UUID teacherId, UUID id) {
    validateTeacher(schoolId, teacherId);
    TeacherSubjectQualification qualification =
        qualificationRepository
            .findById(id)
            .filter(q -> q.getTeacher().getId().equals(teacherId))
            .orElseThrow(() -> new EntityNotFoundException("TeacherSubjectQualification", id));
    qualificationRepository.delete(qualification);
  }

  private Teacher validateTeacher(UUID schoolId, UUID teacherId) {
    return teacherRepository
        .findById(teacherId)
        .filter(t -> t.getSchool().getId().equals(schoolId))
        .orElseThrow(() -> new EntityNotFoundException("Teacher", teacherId));
  }

  private QualificationResponse toResponse(TeacherSubjectQualification q) {
    return new QualificationResponse(
        q.getId(),
        q.getSubject().getId(),
        q.getSubject().getName(),
        q.getQualificationLevel(),
        q.getCanTeachGrades(),
        q.getMaxHoursPerWeek(),
        q.getCreatedAt(),
        q.getUpdatedAt());
  }

  private QualificationSummary toSummary(TeacherSubjectQualification q) {
    return new QualificationSummary(q.getId(), q.getSubject().getName(), q.getQualificationLevel());
  }
}
