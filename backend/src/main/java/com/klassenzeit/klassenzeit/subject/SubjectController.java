package com.klassenzeit.klassenzeit.subject;

import com.klassenzeit.klassenzeit.subject.dto.CreateSubjectRequest;
import com.klassenzeit.klassenzeit.subject.dto.SubjectResponse;
import com.klassenzeit.klassenzeit.subject.dto.SubjectSummary;
import com.klassenzeit.klassenzeit.subject.dto.UpdateSubjectRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for Subject entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/subjects")
public class SubjectController {

  private final SubjectService subjectService;

  public SubjectController(SubjectService subjectService) {
    this.subjectService = subjectService;
  }

  @GetMapping
  public List<SubjectSummary> findAll(@PathVariable UUID schoolId) {
    return subjectService.findAllBySchool(schoolId);
  }

  @GetMapping("/{id}")
  public SubjectResponse findById(@PathVariable UUID schoolId, @PathVariable UUID id) {
    return subjectService.findById(schoolId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public SubjectResponse create(
      @PathVariable UUID schoolId, @Valid @RequestBody CreateSubjectRequest request) {
    return subjectService.create(schoolId, request);
  }

  @PutMapping("/{id}")
  public SubjectResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateSubjectRequest request) {
    return subjectService.update(schoolId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable UUID schoolId, @PathVariable UUID id) {
    subjectService.delete(schoolId, id);
  }
}
