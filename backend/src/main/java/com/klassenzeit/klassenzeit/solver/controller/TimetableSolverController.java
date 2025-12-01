package com.klassenzeit.klassenzeit.solver.controller;

import com.klassenzeit.klassenzeit.solver.dto.SolverJobResponse;
import com.klassenzeit.klassenzeit.solver.dto.TimetableSolutionResponse;
import com.klassenzeit.klassenzeit.solver.service.TimetableSolverService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for timetable solving operations. */
@RestController
@RequestMapping("/api/schools/{schoolId}/terms/{termId}/solver")
@Tag(name = "Timetable Solver", description = "Operations for generating optimal timetables")
public class TimetableSolverController {

  private final TimetableSolverService solverService;

  public TimetableSolverController(TimetableSolverService solverService) {
    this.solverService = solverService;
  }

  @PostMapping("/solve")
  @ResponseStatus(HttpStatus.ACCEPTED)
  @Operation(
      summary = "Start solving",
      description = "Starts the timetable solver asynchronously for the given term")
  public SolverJobResponse startSolving(@PathVariable UUID schoolId, @PathVariable UUID termId) {
    return solverService.startSolving(schoolId, termId);
  }

  @GetMapping("/status")
  @Operation(
      summary = "Get solver status",
      description = "Returns the current status and score of the solving job")
  public SolverJobResponse getStatus(@PathVariable UUID schoolId, @PathVariable UUID termId) {
    return solverService.getStatus(schoolId, termId);
  }

  @PostMapping("/stop")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Operation(
      summary = "Stop solving",
      description = "Terminates the solver early, keeping the best solution found so far")
  public void stopSolving(@PathVariable UUID schoolId, @PathVariable UUID termId) {
    solverService.stopSolving(schoolId, termId);
  }

  @GetMapping("/solution")
  @Operation(
      summary = "Get solution",
      description = "Returns the current best timetable solution with all lesson assignments")
  public TimetableSolutionResponse getSolution(
      @PathVariable UUID schoolId, @PathVariable UUID termId) {
    return solverService.getSolution(schoolId, termId);
  }

  @PostMapping("/apply")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Operation(
      summary = "Apply solution",
      description = "Persists the current best solution to the database")
  public void applySolution(@PathVariable UUID schoolId, @PathVariable UUID termId) {
    solverService.applySolution(schoolId, termId);
  }
}
