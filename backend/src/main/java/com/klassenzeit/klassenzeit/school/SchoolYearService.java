package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.dto.CreateSchoolYearRequest;
import com.klassenzeit.klassenzeit.school.dto.SchoolYearResponse;
import com.klassenzeit.klassenzeit.school.dto.SchoolYearSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateSchoolYearRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for SchoolYear operations. */
@Service
@Transactional(readOnly = true)
public class SchoolYearService {

  private final SchoolYearRepository schoolYearRepository;
  private final SchoolRepository schoolRepository;

  public SchoolYearService(
      SchoolYearRepository schoolYearRepository, SchoolRepository schoolRepository) {
    this.schoolYearRepository = schoolYearRepository;
    this.schoolRepository = schoolRepository;
  }

  public List<SchoolYearSummary> findAllBySchool(UUID schoolId) {
    return schoolYearRepository.findBySchoolIdOrderByStartDateDesc(schoolId).stream()
        .map(this::toSummary)
        .toList();
  }

  public SchoolYearResponse findById(UUID schoolId, UUID id) {
    SchoolYear schoolYear =
        schoolYearRepository
            .findById(id)
            .filter(sy -> sy.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("SchoolYear", id));
    return toResponse(schoolYear);
  }

  @Transactional
  public SchoolYearResponse create(UUID schoolId, CreateSchoolYearRequest request) {
    School school =
        schoolRepository
            .findById(schoolId)
            .orElseThrow(() -> new EntityNotFoundException("School", schoolId));

    SchoolYear schoolYear = new SchoolYear();
    schoolYear.setSchool(school);
    schoolYear.setName(request.name());
    schoolYear.setStartDate(request.startDate());
    schoolYear.setEndDate(request.endDate());
    if (request.isCurrent() != null) {
      schoolYear.setCurrent(request.isCurrent());
    }

    return toResponse(schoolYearRepository.save(schoolYear));
  }

  @Transactional
  public SchoolYearResponse update(UUID schoolId, UUID id, UpdateSchoolYearRequest request) {
    SchoolYear schoolYear =
        schoolYearRepository
            .findById(id)
            .filter(sy -> sy.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("SchoolYear", id));

    if (request.name() != null) {
      schoolYear.setName(request.name());
    }
    if (request.startDate() != null) {
      schoolYear.setStartDate(request.startDate());
    }
    if (request.endDate() != null) {
      schoolYear.setEndDate(request.endDate());
    }
    if (request.isCurrent() != null) {
      schoolYear.setCurrent(request.isCurrent());
    }

    return toResponse(schoolYearRepository.save(schoolYear));
  }

  @Transactional
  public void delete(UUID schoolId, UUID id) {
    SchoolYear schoolYear =
        schoolYearRepository
            .findById(id)
            .filter(sy -> sy.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("SchoolYear", id));
    schoolYearRepository.delete(schoolYear);
  }

  private SchoolYearResponse toResponse(SchoolYear sy) {
    return new SchoolYearResponse(
        sy.getId(),
        sy.getName(),
        sy.getStartDate(),
        sy.getEndDate(),
        sy.isCurrent(),
        sy.getCreatedAt(),
        sy.getUpdatedAt(),
        sy.getVersion());
  }

  private SchoolYearSummary toSummary(SchoolYear sy) {
    return new SchoolYearSummary(
        sy.getId(), sy.getName(), sy.getStartDate(), sy.getEndDate(), sy.isCurrent());
  }
}
