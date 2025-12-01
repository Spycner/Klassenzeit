package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.dto.CreateTermRequest;
import com.klassenzeit.klassenzeit.school.dto.TermResponse;
import com.klassenzeit.klassenzeit.school.dto.TermSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateTermRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for Term operations. */
@Service
@Transactional(readOnly = true)
public class TermService {

  private final TermRepository termRepository;
  private final SchoolYearRepository schoolYearRepository;

  public TermService(TermRepository termRepository, SchoolYearRepository schoolYearRepository) {
    this.termRepository = termRepository;
    this.schoolYearRepository = schoolYearRepository;
  }

  public List<TermSummary> findAllBySchoolYear(UUID schoolId, UUID schoolYearId) {
    validateSchoolYear(schoolId, schoolYearId);
    return termRepository.findBySchoolYearIdOrderByStartDateAsc(schoolYearId).stream()
        .map(this::toSummary)
        .toList();
  }

  public TermResponse findById(UUID schoolId, UUID schoolYearId, UUID id) {
    validateSchoolYear(schoolId, schoolYearId);
    Term term =
        termRepository
            .findById(id)
            .filter(t -> t.getSchoolYear().getId().equals(schoolYearId))
            .orElseThrow(() -> new EntityNotFoundException("Term", id));
    return toResponse(term);
  }

  @Transactional
  public TermResponse create(UUID schoolId, UUID schoolYearId, CreateTermRequest request) {
    SchoolYear schoolYear = validateSchoolYear(schoolId, schoolYearId);

    Term term = new Term();
    term.setSchoolYear(schoolYear);
    term.setName(request.name());
    term.setStartDate(request.startDate());
    term.setEndDate(request.endDate());
    if (request.isCurrent() != null) {
      term.setCurrent(request.isCurrent());
    }

    return toResponse(termRepository.save(term));
  }

  @Transactional
  public TermResponse update(UUID schoolId, UUID schoolYearId, UUID id, UpdateTermRequest request) {
    validateSchoolYear(schoolId, schoolYearId);
    Term term =
        termRepository
            .findById(id)
            .filter(t -> t.getSchoolYear().getId().equals(schoolYearId))
            .orElseThrow(() -> new EntityNotFoundException("Term", id));

    if (request.name() != null) {
      term.setName(request.name());
    }
    if (request.startDate() != null) {
      term.setStartDate(request.startDate());
    }
    if (request.endDate() != null) {
      term.setEndDate(request.endDate());
    }
    if (request.isCurrent() != null) {
      term.setCurrent(request.isCurrent());
    }

    return toResponse(termRepository.save(term));
  }

  @Transactional
  public void delete(UUID schoolId, UUID schoolYearId, UUID id) {
    validateSchoolYear(schoolId, schoolYearId);
    Term term =
        termRepository
            .findById(id)
            .filter(t -> t.getSchoolYear().getId().equals(schoolYearId))
            .orElseThrow(() -> new EntityNotFoundException("Term", id));
    termRepository.delete(term);
  }

  private SchoolYear validateSchoolYear(UUID schoolId, UUID schoolYearId) {
    return schoolYearRepository
        .findById(schoolYearId)
        .filter(sy -> sy.getSchool().getId().equals(schoolId))
        .orElseThrow(() -> new EntityNotFoundException("SchoolYear", schoolYearId));
  }

  private TermResponse toResponse(Term t) {
    return new TermResponse(
        t.getId(),
        t.getName(),
        t.getStartDate(),
        t.getEndDate(),
        t.isCurrent(),
        t.getCreatedAt(),
        t.getUpdatedAt());
  }

  private TermSummary toSummary(Term t) {
    return new TermSummary(t.getId(), t.getName(), t.getStartDate(), t.getEndDate(), t.isCurrent());
  }
}
