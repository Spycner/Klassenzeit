package com.klassenzeit.klassenzeit.subject;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolRepository;
import com.klassenzeit.klassenzeit.subject.dto.CreateSubjectRequest;
import com.klassenzeit.klassenzeit.subject.dto.SubjectResponse;
import com.klassenzeit.klassenzeit.subject.dto.SubjectSummary;
import com.klassenzeit.klassenzeit.subject.dto.UpdateSubjectRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for Subject operations. */
@Service
@Transactional(readOnly = true)
public class SubjectService {

  private final SubjectRepository subjectRepository;
  private final SchoolRepository schoolRepository;

  public SubjectService(SubjectRepository subjectRepository, SchoolRepository schoolRepository) {
    this.subjectRepository = subjectRepository;
    this.schoolRepository = schoolRepository;
  }

  public List<SubjectSummary> findAllBySchool(UUID schoolId) {
    return subjectRepository.findBySchoolId(schoolId).stream().map(this::toSummary).toList();
  }

  public SubjectResponse findById(UUID schoolId, UUID id) {
    Subject subject =
        subjectRepository
            .findById(id)
            .filter(s -> s.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Subject", id));
    return toResponse(subject);
  }

  @Transactional
  public SubjectResponse create(UUID schoolId, CreateSubjectRequest request) {
    School school =
        schoolRepository
            .findById(schoolId)
            .orElseThrow(() -> new EntityNotFoundException("School", schoolId));

    Subject subject = new Subject();
    subject.setSchool(school);
    subject.setName(request.name());
    subject.setAbbreviation(request.abbreviation());
    subject.setColor(request.color());
    subject.setNeedsSpecialRoom(request.needsSpecialRoom() != null && request.needsSpecialRoom());

    return toResponse(subjectRepository.save(subject));
  }

  @Transactional
  public SubjectResponse update(UUID schoolId, UUID id, UpdateSubjectRequest request) {
    Subject subject =
        subjectRepository
            .findById(id)
            .filter(s -> s.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Subject", id));

    if (request.name() != null) {
      subject.setName(request.name());
    }
    if (request.abbreviation() != null) {
      subject.setAbbreviation(request.abbreviation());
    }
    if (request.color() != null) {
      subject.setColor(request.color());
    }
    if (request.needsSpecialRoom() != null) {
      subject.setNeedsSpecialRoom(request.needsSpecialRoom());
    }

    return toResponse(subjectRepository.save(subject));
  }

  @Transactional
  public void delete(UUID schoolId, UUID id) {
    Subject subject =
        subjectRepository
            .findById(id)
            .filter(s -> s.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Subject", id));
    subjectRepository.delete(subject);
  }

  private SubjectResponse toResponse(Subject s) {
    return new SubjectResponse(
        s.getId(),
        s.getName(),
        s.getAbbreviation(),
        s.getColor(),
        s.isNeedsSpecialRoom(),
        s.getCreatedAt(),
        s.getUpdatedAt(),
        s.getVersion());
  }

  private SubjectSummary toSummary(Subject s) {
    return new SubjectSummary(
        s.getId(), s.getName(), s.getAbbreviation(), s.getColor(), s.isNeedsSpecialRoom());
  }
}
