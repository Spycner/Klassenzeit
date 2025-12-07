package com.klassenzeit.klassenzeit.solver.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import com.klassenzeit.klassenzeit.security.TestSecurityConfig;
import com.klassenzeit.klassenzeit.solver.dto.LessonAssignment;
import com.klassenzeit.klassenzeit.solver.dto.SolveStatus;
import com.klassenzeit.klassenzeit.solver.dto.SolverJobResponse;
import com.klassenzeit.klassenzeit.solver.dto.TimetableSolutionResponse;
import com.klassenzeit.klassenzeit.solver.service.TimetableSolverService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(TimetableSolverController.class)
@Import(TestSecurityConfig.class)
@ActiveProfiles("test")
class TimetableSolverControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private TimetableSolverService solverService;

  @MockitoBean(name = "authz")
  private AuthorizationService authorizationService;

  private final UUID schoolId = UUID.randomUUID();
  private final UUID termId = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    // Allow all authorization checks in tests
    when(authorizationService.canAccessSchool(any())).thenReturn(true);
    when(authorizationService.canManageSchool(any())).thenReturn(true);
  }

  private String baseUrl() {
    return "/api/schools/" + schoolId + "/terms/" + termId + "/solver";
  }

  @Nested
  class StartSolving {

    @Test
    void startSolving_returns202Accepted() throws Exception {
      SolverJobResponse response =
          new SolverJobResponse(termId, SolveStatus.SOLVING, null, null, null);
      when(solverService.startSolving(schoolId, termId)).thenReturn(response);

      mockMvc
          .perform(post(baseUrl() + "/solve"))
          .andExpect(status().isAccepted())
          .andExpect(jsonPath("$.termId").value(termId.toString()))
          .andExpect(jsonPath("$.status").value("SOLVING"));

      verify(solverService).startSolving(schoolId, termId);
    }

    @Test
    void startSolving_termNotFound_returns404() throws Exception {
      when(solverService.startSolving(any(), any()))
          .thenThrow(new EntityNotFoundException("Term", termId));

      mockMvc.perform(post(baseUrl() + "/solve")).andExpect(status().isNotFound());
    }

    @Test
    void startSolving_alreadyRunning_returns409() throws Exception {
      when(solverService.startSolving(any(), any()))
          .thenThrow(new IllegalStateException("Solver is already running"));

      mockMvc.perform(post(baseUrl() + "/solve")).andExpect(status().isConflict());
    }

    @Test
    void startSolving_noLessons_returns400() throws Exception {
      when(solverService.startSolving(any(), any()))
          .thenThrow(new IllegalArgumentException("No lessons to solve"));

      mockMvc.perform(post(baseUrl() + "/solve")).andExpect(status().isBadRequest());
    }
  }

  @Nested
  class GetStatus {

    @Test
    void getStatus_returnsCurrentStatus() throws Exception {
      SolverJobResponse response =
          new SolverJobResponse(termId, SolveStatus.SOLVING, "-1hard/-5soft", 1, 5);
      when(solverService.getStatus(schoolId, termId)).thenReturn(response);

      mockMvc
          .perform(get(baseUrl() + "/status"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.termId").value(termId.toString()))
          .andExpect(jsonPath("$.status").value("SOLVING"))
          .andExpect(jsonPath("$.score").value("-1hard/-5soft"))
          .andExpect(jsonPath("$.hardViolations").value(1))
          .andExpect(jsonPath("$.softPenalties").value(5));
    }

    @Test
    void getStatus_notSolving_returnsNotSolvingStatus() throws Exception {
      SolverJobResponse response =
          new SolverJobResponse(termId, SolveStatus.NOT_SOLVING, null, null, null);
      when(solverService.getStatus(schoolId, termId)).thenReturn(response);

      mockMvc
          .perform(get(baseUrl() + "/status"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("NOT_SOLVING"))
          .andExpect(jsonPath("$.score").isEmpty());
    }

    @Test
    void getStatus_termNotFound_returns404() throws Exception {
      when(solverService.getStatus(any(), any()))
          .thenThrow(new EntityNotFoundException("Term", termId));

      mockMvc.perform(get(baseUrl() + "/status")).andExpect(status().isNotFound());
    }
  }

  @Nested
  class StopSolving {

    @Test
    void stopSolving_returns204NoContent() throws Exception {
      doNothing().when(solverService).stopSolving(schoolId, termId);

      mockMvc.perform(post(baseUrl() + "/stop")).andExpect(status().isNoContent());

      verify(solverService).stopSolving(schoolId, termId);
    }

    @Test
    void stopSolving_termNotFound_returns404() throws Exception {
      doThrow(new EntityNotFoundException("Term", termId))
          .when(solverService)
          .stopSolving(any(), any());

      mockMvc.perform(post(baseUrl() + "/stop")).andExpect(status().isNotFound());
    }
  }

  @Nested
  class GetSolution {

    @Test
    void getSolution_returnsSolution() throws Exception {
      UUID lessonId = UUID.randomUUID();
      UUID classId = UUID.randomUUID();
      UUID teacherId = UUID.randomUUID();
      UUID subjectId = UUID.randomUUID();
      UUID timeSlotId = UUID.randomUUID();
      UUID roomId = UUID.randomUUID();

      LessonAssignment assignment =
          new LessonAssignment(
              lessonId,
              classId,
              "1a",
              teacherId,
              "Anna Müller",
              subjectId,
              "Math",
              timeSlotId,
              (short) 0,
              (short) 1,
              roomId,
              "Room 101",
              WeekPattern.EVERY);

      TimetableSolutionResponse response =
          new TimetableSolutionResponse(
              termId, "0hard/-3soft", 0, 3, List.of(assignment), List.of());
      when(solverService.getSolution(schoolId, termId)).thenReturn(response);

      mockMvc
          .perform(get(baseUrl() + "/solution"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.termId").value(termId.toString()))
          .andExpect(jsonPath("$.score").value("0hard/-3soft"))
          .andExpect(jsonPath("$.hardViolations").value(0))
          .andExpect(jsonPath("$.softPenalties").value(3))
          .andExpect(jsonPath("$.assignments").isArray())
          .andExpect(jsonPath("$.assignments[0].lessonId").value(lessonId.toString()))
          .andExpect(jsonPath("$.assignments[0].schoolClassName").value("1a"))
          .andExpect(jsonPath("$.assignments[0].teacherName").value("Anna Müller"));
    }

    @Test
    void getSolution_noSolution_returns400() throws Exception {
      when(solverService.getSolution(any(), any()))
          .thenThrow(new IllegalStateException("No solution available"));

      mockMvc.perform(get(baseUrl() + "/solution")).andExpect(status().isBadRequest());
    }

    @Test
    void getSolution_termNotFound_returns404() throws Exception {
      when(solverService.getSolution(any(), any()))
          .thenThrow(new EntityNotFoundException("Term", termId));

      mockMvc.perform(get(baseUrl() + "/solution")).andExpect(status().isNotFound());
    }
  }

  @Nested
  class ApplySolution {

    @Test
    void applySolution_returns204NoContent() throws Exception {
      doNothing().when(solverService).applySolution(schoolId, termId);

      mockMvc.perform(post(baseUrl() + "/apply")).andExpect(status().isNoContent());

      verify(solverService).applySolution(schoolId, termId);
    }

    @Test
    void applySolution_noSolution_returns400() throws Exception {
      doThrow(new IllegalStateException("No solution available"))
          .when(solverService)
          .applySolution(any(), any());

      mockMvc.perform(post(baseUrl() + "/apply")).andExpect(status().isBadRequest());
    }

    @Test
    void applySolution_stillSolving_returns409() throws Exception {
      doThrow(new IllegalStateException("Cannot apply solution while solver is still running"))
          .when(solverService)
          .applySolution(any(), any());

      mockMvc.perform(post(baseUrl() + "/apply")).andExpect(status().isConflict());
    }

    @Test
    void applySolution_termNotFound_returns404() throws Exception {
      doThrow(new EntityNotFoundException("Term", termId))
          .when(solverService)
          .applySolution(any(), any());

      mockMvc.perform(post(baseUrl() + "/apply")).andExpect(status().isNotFound());
    }
  }
}
