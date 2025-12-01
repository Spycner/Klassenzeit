package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.school.dto.CreateSchoolYearRequest;
import com.klassenzeit.klassenzeit.school.dto.SchoolYearResponse;
import com.klassenzeit.klassenzeit.school.dto.SchoolYearSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateSchoolYearRequest;
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

/** REST controller for SchoolYear entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/school-years")
public class SchoolYearController {

  private final SchoolYearService schoolYearService;

  public SchoolYearController(SchoolYearService schoolYearService) {
    this.schoolYearService = schoolYearService;
  }

  @GetMapping
  public List<SchoolYearSummary> findAll(@PathVariable UUID schoolId) {
    return schoolYearService.findAllBySchool(schoolId);
  }

  @GetMapping("/{id}")
  public SchoolYearResponse findById(@PathVariable UUID schoolId, @PathVariable UUID id) {
    return schoolYearService.findById(schoolId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public SchoolYearResponse create(
      @PathVariable UUID schoolId, @Valid @RequestBody CreateSchoolYearRequest request) {
    return schoolYearService.create(schoolId, request);
  }

  @PutMapping("/{id}")
  public SchoolYearResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateSchoolYearRequest request) {
    return schoolYearService.update(schoolId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable UUID schoolId, @PathVariable UUID id) {
    schoolYearService.delete(schoolId, id);
  }
}
