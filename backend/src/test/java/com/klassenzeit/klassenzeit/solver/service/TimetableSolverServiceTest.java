package com.klassenzeit.klassenzeit.solver.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolYear;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.solver.dto.SolveStatus;
import com.klassenzeit.klassenzeit.solver.dto.SolverJobResponse;
import com.klassenzeit.klassenzeit.solver.dto.TimetableSolutionResponse;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
@SuppressWarnings("PMD.DoNotUseThreads") // Thread.sleep is required for testing async solver
class TimetableSolverServiceTest extends AbstractIntegrationTest {

  @Autowired private TimetableSolverService solverService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private Term term;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    SchoolYear schoolYear = testData.schoolYear(school).persist();
    term = testData.term(schoolYear).persist();
  }

  @Nested
  class StartSolving {

    @Test
    void startSolving_withValidTerm_returnsSolvingStatus() {
      // Given
      createTestLessons();
      entityManager.flush();
      entityManager.clear();

      // When
      SolverJobResponse response = solverService.startSolving(school.getId(), term.getId());

      // Then
      assertThat(response.termId()).isEqualTo(term.getId());
      assertThat(response.status()).isEqualTo(SolveStatus.SOLVING);

      // Wait a bit for solver to finish then clean up
      waitAndStopSolver(term.getId());
    }

    @Test
    void startSolving_withNoLessons_throwsIllegalArgumentException() {
      // Given - no lessons created
      entityManager.flush();
      entityManager.clear();

      // When/Then
      assertThatThrownBy(() -> solverService.startSolving(school.getId(), term.getId()))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("No lessons to solve");
    }

    @Test
    void startSolving_withInvalidTerm_throwsEntityNotFoundException() {
      UUID invalidTermId = UUID.randomUUID();

      assertThatThrownBy(() -> solverService.startSolving(school.getId(), invalidTermId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Term");
    }

    @Test
    void startSolving_withTermFromDifferentSchool_throwsEntityNotFoundException() {
      // Given - term belongs to different school
      School otherSchool = testData.school().persist();
      SchoolYear otherSchoolYear = testData.schoolYear(otherSchool).persist();
      Term otherTerm = testData.term(otherSchoolYear).persist();
      entityManager.flush();
      entityManager.clear();

      // When/Then
      assertThatThrownBy(() -> solverService.startSolving(school.getId(), otherTerm.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class GetStatus {

    @Test
    void getStatus_notStarted_returnsNotSolvingStatus() {
      // Given - no solving has started
      entityManager.flush();
      entityManager.clear();

      // When
      SolverJobResponse response = solverService.getStatus(school.getId(), term.getId());

      // Then
      assertThat(response.termId()).isEqualTo(term.getId());
      assertThat(response.status()).isEqualTo(SolveStatus.NOT_SOLVING);
      assertThat(response.score()).isNull();
    }

    @Test
    void getStatus_withInvalidTerm_throwsEntityNotFoundException() {
      UUID invalidTermId = UUID.randomUUID();

      assertThatThrownBy(() -> solverService.getStatus(school.getId(), invalidTermId))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class StopSolving {

    @Test
    void stopSolving_notRunning_doesNotThrow() {
      // Given - no solver running
      entityManager.flush();
      entityManager.clear();

      // When/Then - should not throw
      solverService.stopSolving(school.getId(), term.getId());
    }

    @Test
    void stopSolving_withInvalidTerm_throwsEntityNotFoundException() {
      UUID invalidTermId = UUID.randomUUID();

      assertThatThrownBy(() -> solverService.stopSolving(school.getId(), invalidTermId))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class GetSolution {

    @Test
    void getSolution_noSolution_throwsIllegalStateException() {
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> solverService.getSolution(school.getId(), term.getId()))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("No solution available");
    }

    @Test
    void getSolution_withInvalidTerm_throwsEntityNotFoundException() {
      UUID invalidTermId = UUID.randomUUID();

      assertThatThrownBy(() -> solverService.getSolution(school.getId(), invalidTermId))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class ApplySolution {

    @Test
    void applySolution_noSolution_throwsIllegalStateException() {
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> solverService.applySolution(school.getId(), term.getId()))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("No solution available");
    }

    @Test
    void applySolution_withInvalidTerm_throwsEntityNotFoundException() {
      UUID invalidTermId = UUID.randomUUID();

      assertThatThrownBy(() -> solverService.applySolution(school.getId(), invalidTermId))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class SolvingIntegration {

    @Test
    void fullSolveWorkflow_solvesAndReturnsValidSolution() throws Exception {
      // Given
      createTestLessons();
      entityManager.flush();
      entityManager.clear();

      // When - start solving
      SolverJobResponse startResponse = solverService.startSolving(school.getId(), term.getId());
      assertThat(startResponse.status()).isEqualTo(SolveStatus.SOLVING);

      // Wait for solver to complete (short timeout since test data is small)
      waitForSolverCompletion(term.getId(), 10_000);

      // Then - get status should show SOLVED
      SolverJobResponse statusResponse = solverService.getStatus(school.getId(), term.getId());
      assertThat(statusResponse.status()).isEqualTo(SolveStatus.SOLVED);
      assertThat(statusResponse.score()).isNotNull();

      // And - get solution should return valid assignments
      TimetableSolutionResponse solution = solverService.getSolution(school.getId(), term.getId());
      assertThat(solution.termId()).isEqualTo(term.getId());
      assertThat(solution.assignments()).hasSize(2); // We created 2 lessons
      assertThat(solution.hardViolations()).isZero();
    }
  }

  // ========== Helper Methods ==========

  private void createTestLessons() {
    Teacher teacher =
        testData.teacher(school).withFirstName("Anna").withLastName("Müller").persist();

    Subject math = testData.subject(school).withName("Math").withAbbreviation("MA").persist();

    // Create qualification so teacher can teach
    testData.qualification(teacher, math).withGrades(List.of(1, 2, 3, 4)).persist();

    Room room = testData.room(school).withName("Room 101").withCapacity(30).persist();

    SchoolClass class1a =
        testData.schoolClass(school).withName("1a").withGradeLevel((short) 1).persist();

    // Create time slots (Mon period 1, 2)
    TimeSlot monPeriod1 =
        testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 1).persist();
    TimeSlot monPeriod2 =
        testData.timeSlot(school).withDayOfWeek((short) 0).withPeriod((short) 2).persist();

    // Create 2 lessons
    testData.lesson(term, class1a, teacher, math, monPeriod1).withRoom(room).persist();
    testData.lesson(term, class1a, teacher, math, monPeriod2).withRoom(room).persist();
  }

  private void waitAndStopSolver(UUID termId) {
    try {
      Thread.sleep(500); // Give solver time to start
      solverService.stopSolving(school.getId(), termId);
      Thread.sleep(500); // Give solver time to terminate
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private void waitForSolverCompletion(UUID termId, long timeoutMs) throws InterruptedException {
    long startTime = System.currentTimeMillis();
    while (System.currentTimeMillis() - startTime < timeoutMs) {
      SolverJobResponse status = solverService.getStatus(school.getId(), termId);
      if (status.status() == SolveStatus.SOLVED
          || status.status() == SolveStatus.TERMINATED_EARLY) {
        return;
      }
      Thread.sleep(100);
    }
    // Force stop if timeout reached
    solverService.stopSolving(school.getId(), termId);
    Thread.sleep(500);
  }
}
