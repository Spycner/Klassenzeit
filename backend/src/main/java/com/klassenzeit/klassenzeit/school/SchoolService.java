package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.dto.CreateSchoolRequest;
import com.klassenzeit.klassenzeit.school.dto.SchoolResponse;
import com.klassenzeit.klassenzeit.school.dto.SchoolSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateSchoolRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for School operations. */
@Service
@Transactional(readOnly = true)
public class SchoolService {

  private final SchoolRepository schoolRepository;

  public SchoolService(SchoolRepository schoolRepository) {
    this.schoolRepository = schoolRepository;
  }

  public List<SchoolSummary> findAll() {
    return schoolRepository.findAll().stream().map(this::toSummary).toList();
  }

  public SchoolResponse findById(UUID id) {
    School school =
        schoolRepository.findById(id).orElseThrow(() -> new EntityNotFoundException("School", id));
    return toResponse(school);
  }

  @Transactional
  public SchoolResponse create(CreateSchoolRequest request) {
    School school = new School();
    school.setName(request.name());
    school.setSlug(request.slug());
    school.setSchoolType(request.schoolType());
    school.setMinGrade(request.minGrade());
    school.setMaxGrade(request.maxGrade());
    if (request.timezone() != null) {
      school.setTimezone(request.timezone());
    }
    if (request.settings() != null) {
      school.setSettings(request.settings());
    }

    return toResponse(schoolRepository.save(school));
  }

  @Transactional
  public SchoolResponse update(UUID id, UpdateSchoolRequest request) {
    School school =
        schoolRepository.findById(id).orElseThrow(() -> new EntityNotFoundException("School", id));

    if (request.name() != null) {
      school.setName(request.name());
    }
    if (request.slug() != null) {
      school.setSlug(request.slug());
    }
    if (request.schoolType() != null) {
      school.setSchoolType(request.schoolType());
    }
    if (request.minGrade() != null) {
      school.setMinGrade(request.minGrade());
    }
    if (request.maxGrade() != null) {
      school.setMaxGrade(request.maxGrade());
    }
    if (request.timezone() != null) {
      school.setTimezone(request.timezone());
    }
    if (request.settings() != null) {
      school.setSettings(request.settings());
    }

    return toResponse(schoolRepository.save(school));
  }

  @Transactional
  public void delete(UUID id) {
    School school =
        schoolRepository.findById(id).orElseThrow(() -> new EntityNotFoundException("School", id));
    schoolRepository.delete(school);
  }

  private SchoolResponse toResponse(School s) {
    return new SchoolResponse(
        s.getId(),
        s.getName(),
        s.getSlug(),
        s.getSchoolType(),
        s.getMinGrade(),
        s.getMaxGrade(),
        s.getTimezone(),
        s.getSettings(),
        s.getCreatedAt(),
        s.getUpdatedAt());
  }

  private SchoolSummary toSummary(School s) {
    return new SchoolSummary(s.getId(), s.getName(), s.getSlug(), s.getSchoolType());
  }
}
