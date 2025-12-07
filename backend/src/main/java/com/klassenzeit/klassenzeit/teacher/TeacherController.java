package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.teacher.dto.CreateTeacherRequest;
import com.klassenzeit.klassenzeit.teacher.dto.TeacherResponse;
import com.klassenzeit.klassenzeit.teacher.dto.TeacherSummary;
import com.klassenzeit.klassenzeit.teacher.dto.UpdateTeacherRequest;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for Teacher entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/teachers")
public class TeacherController {

  private final TeacherService teacherService;

  public TeacherController(TeacherService teacherService) {
    this.teacherService = teacherService;
  }

  @GetMapping
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public List<TeacherSummary> findAll(
      @PathVariable UUID schoolId, @RequestParam(required = false) Boolean includeInactive) {
    return teacherService.findAllBySchool(schoolId, Boolean.TRUE.equals(includeInactive));
  }

  @GetMapping("/{id}")
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public TeacherResponse findById(@PathVariable UUID schoolId, @PathVariable UUID id) {
    return teacherService.findById(schoolId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public TeacherResponse create(
      @PathVariable UUID schoolId, @Valid @RequestBody CreateTeacherRequest request) {
    return teacherService.create(schoolId, request);
  }

  @PutMapping("/{id}")
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public TeacherResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateTeacherRequest request) {
    return teacherService.update(schoolId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void delete(@PathVariable UUID schoolId, @PathVariable UUID id) {
    teacherService.delete(schoolId, id);
  }

  @DeleteMapping("/{id}/permanent")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void deletePermanent(@PathVariable UUID schoolId, @PathVariable UUID id) {
    teacherService.deletePermanent(schoolId, id);
  }
}
