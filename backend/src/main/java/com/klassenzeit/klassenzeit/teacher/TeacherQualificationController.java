package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.teacher.dto.CreateQualificationRequest;
import com.klassenzeit.klassenzeit.teacher.dto.QualificationResponse;
import com.klassenzeit.klassenzeit.teacher.dto.QualificationSummary;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateQualificationRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for TeacherSubjectQualification entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/teachers/{teacherId}/qualifications")
public class TeacherQualificationController {

  private final TeacherQualificationService qualificationService;

  public TeacherQualificationController(TeacherQualificationService qualificationService) {
    this.qualificationService = qualificationService;
  }

  @GetMapping
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public List<QualificationSummary> findAll(
      @PathVariable UUID schoolId, @PathVariable UUID teacherId) {
    return qualificationService.findAllByTeacher(schoolId, teacherId);
  }

  @GetMapping("/{id}")
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public QualificationResponse findById(
      @PathVariable UUID schoolId, @PathVariable UUID teacherId, @PathVariable UUID id) {
    return qualificationService.findById(schoolId, teacherId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public QualificationResponse create(
      @PathVariable UUID schoolId,
      @PathVariable UUID teacherId,
      @Valid @RequestBody CreateQualificationRequest request) {
    return qualificationService.create(schoolId, teacherId, request);
  }

  @PutMapping("/{id}")
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public QualificationResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID teacherId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateQualificationRequest request) {
    return qualificationService.update(schoolId, teacherId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void delete(
      @PathVariable UUID schoolId, @PathVariable UUID teacherId, @PathVariable UUID id) {
    qualificationService.delete(schoolId, teacherId, id);
  }
}
