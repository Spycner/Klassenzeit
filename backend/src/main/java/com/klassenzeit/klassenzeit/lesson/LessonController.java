package com.klassenzeit.klassenzeit.lesson;

import com.klassenzeit.klassenzeit.lesson.dto.CreateLessonRequest;
import com.klassenzeit.klassenzeit.lesson.dto.LessonResponse;
import com.klassenzeit.klassenzeit.lesson.dto.LessonSummary;
import com.klassenzeit.klassenzeit.lesson.dto.UpdateLessonRequest;
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

/** REST controller for Lesson entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/terms/{termId}/lessons")
public class LessonController {

  private final LessonService lessonService;

  public LessonController(LessonService lessonService) {
    this.lessonService = lessonService;
  }

  @GetMapping
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public List<LessonSummary> findAll(@PathVariable UUID schoolId, @PathVariable UUID termId) {
    return lessonService.findAllByTerm(schoolId, termId);
  }

  @GetMapping("/{id}")
  @PreAuthorize("@authz.canAccessSchool(#schoolId)")
  public LessonResponse findById(
      @PathVariable UUID schoolId, @PathVariable UUID termId, @PathVariable UUID id) {
    return lessonService.findById(schoolId, termId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public LessonResponse create(
      @PathVariable UUID schoolId,
      @PathVariable UUID termId,
      @Valid @RequestBody CreateLessonRequest request) {
    return lessonService.create(schoolId, termId, request);
  }

  @PutMapping("/{id}")
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public LessonResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID termId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateLessonRequest request) {
    return lessonService.update(schoolId, termId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("@authz.canManageSchool(#schoolId)")
  public void delete(
      @PathVariable UUID schoolId, @PathVariable UUID termId, @PathVariable UUID id) {
    lessonService.delete(schoolId, termId, id);
  }
}
