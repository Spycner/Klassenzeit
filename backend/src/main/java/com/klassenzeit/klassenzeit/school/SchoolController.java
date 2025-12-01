package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.school.dto.CreateSchoolRequest;
import com.klassenzeit.klassenzeit.school.dto.SchoolResponse;
import com.klassenzeit.klassenzeit.school.dto.SchoolSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateSchoolRequest;
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

/** REST controller for School entities. */
@RestController
@RequestMapping("/api/schools")
public class SchoolController {

  private final SchoolService schoolService;

  public SchoolController(SchoolService schoolService) {
    this.schoolService = schoolService;
  }

  @GetMapping
  public List<SchoolSummary> findAll() {
    return schoolService.findAll();
  }

  @GetMapping("/{id}")
  public SchoolResponse findById(@PathVariable UUID id) {
    return schoolService.findById(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public SchoolResponse create(@Valid @RequestBody CreateSchoolRequest request) {
    return schoolService.create(request);
  }

  @PutMapping("/{id}")
  public SchoolResponse update(
      @PathVariable UUID id, @Valid @RequestBody UpdateSchoolRequest request) {
    return schoolService.update(id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable UUID id) {
    schoolService.delete(id);
  }
}
