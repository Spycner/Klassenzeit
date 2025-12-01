package com.klassenzeit.klassenzeit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.subject.SubjectRepository;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.teacher.TeacherRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests verifying optimistic locking behavior for concurrent operations.
 *
 * <p>These tests verify that concurrent modifications to the same entity are detected using the
 * version field and result in an {@link ObjectOptimisticLockingFailureException}.
 */
@Transactional
class ConcurrentOperationIntegrationTest extends AbstractIntegrationTest {

  @Autowired private EntityManager entityManager;
  @Autowired private TeacherRepository teacherRepository;
  @Autowired private SubjectRepository subjectRepository;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Nested
  class VersionFieldBehavior {

    @Test
    void newEntity_hasVersionZero() {
      Teacher teacher = testData.teacher(school).persist();
      entityManager.flush();

      assertThat(teacher.getVersion()).isEqualTo(0L);
    }

    @Test
    void updatedEntity_incrementsVersion() {
      Teacher teacher = testData.teacher(school).persist();
      entityManager.flush();
      entityManager.clear();

      Teacher loaded = teacherRepository.findById(teacher.getId()).orElseThrow();
      assertThat(loaded.getVersion()).isEqualTo(0L);

      loaded.setFirstName("Updated");
      teacherRepository.saveAndFlush(loaded);
      entityManager.clear();

      Teacher reloaded = teacherRepository.findById(teacher.getId()).orElseThrow();
      assertThat(reloaded.getVersion()).isEqualTo(1L);
    }

    @Test
    void multipleUpdates_incrementVersionEachTime() {
      Teacher teacher = testData.teacher(school).persist();
      entityManager.flush();
      entityManager.clear();

      for (int i = 1; i <= 3; i++) {
        Teacher loaded = teacherRepository.findById(teacher.getId()).orElseThrow();
        loaded.setFirstName("Update " + i);
        teacherRepository.saveAndFlush(loaded);
        entityManager.clear();
      }

      Teacher finalTeacher = teacherRepository.findById(teacher.getId()).orElseThrow();
      assertThat(finalTeacher.getVersion()).isEqualTo(3L);
    }
  }

  @Nested
  class ConcurrentModificationDetection {

    @Test
    void concurrentUpdate_withStaleVersion_throwsOptimisticLockException() {
      // Given: A teacher exists
      Teacher teacher = testData.teacher(school).withFirstName("Original").persist();
      entityManager.flush();
      entityManager.clear();

      // When: Two users load the same entity
      Teacher user1View = teacherRepository.findById(teacher.getId()).orElseThrow();
      entityManager.detach(user1View);

      Teacher user2View = teacherRepository.findById(teacher.getId()).orElseThrow();

      // And: User 2 updates first
      user2View.setFirstName("Updated by User 2");
      teacherRepository.saveAndFlush(user2View);
      entityManager.clear();

      // Then: User 1's stale update should fail
      user1View.setFirstName("Updated by User 1");
      assertThatThrownBy(() -> teacherRepository.saveAndFlush(user1View))
          .isInstanceOf(ObjectOptimisticLockingFailureException.class);
    }

    @Test
    void concurrentUpdate_onDifferentEntities_succeeds() {
      // Given: Two different teachers
      Teacher teacher1 = testData.teacher(school).withAbbreviation("T1").persist();
      Teacher teacher2 = testData.teacher(school).withAbbreviation("T2").persist();
      entityManager.flush();
      entityManager.clear();

      // When: Loading both teachers
      Teacher t1 = teacherRepository.findById(teacher1.getId()).orElseThrow();
      Teacher t2 = teacherRepository.findById(teacher2.getId()).orElseThrow();

      // Then: Both can be updated without conflict
      t1.setFirstName("Updated T1");
      teacherRepository.saveAndFlush(t1);

      t2.setFirstName("Updated T2");
      teacherRepository.saveAndFlush(t2);

      entityManager.clear();

      assertThat(teacherRepository.findById(teacher1.getId()).orElseThrow().getFirstName())
          .isEqualTo("Updated T1");
      assertThat(teacherRepository.findById(teacher2.getId()).orElseThrow().getFirstName())
          .isEqualTo("Updated T2");
    }

    @Test
    void concurrentUpdate_afterSuccessfulRetry_succeeds() {
      // Given: A teacher exists
      Teacher teacher = testData.teacher(school).withFirstName("Original").persist();
      entityManager.flush();
      entityManager.clear();

      // When: Two users load the same entity
      Teacher user1View = teacherRepository.findById(teacher.getId()).orElseThrow();
      entityManager.detach(user1View);

      Teacher user2View = teacherRepository.findById(teacher.getId()).orElseThrow();

      // And: User 2 updates first
      user2View.setFirstName("Updated by User 2");
      teacherRepository.saveAndFlush(user2View);
      entityManager.clear();

      // And: User 1's stale update fails
      user1View.setFirstName("Updated by User 1");
      assertThatThrownBy(() -> teacherRepository.saveAndFlush(user1View))
          .isInstanceOf(ObjectOptimisticLockingFailureException.class);

      // Then: User 1 can retry by reloading and updating with fresh version
      entityManager.clear();
      Teacher freshLoad = teacherRepository.findById(teacher.getId()).orElseThrow();
      freshLoad.setFirstName("Updated by User 1 (retry)");
      teacherRepository.saveAndFlush(freshLoad);
      entityManager.clear();

      Teacher finalState = teacherRepository.findById(teacher.getId()).orElseThrow();
      assertThat(finalState.getFirstName()).isEqualTo("Updated by User 1 (retry)");
      assertThat(finalState.getVersion()).isEqualTo(2L);
    }
  }

  @Nested
  class OptimisticLockingAcrossEntities {

    @Test
    void subjectUpdate_withStaleVersion_throwsOptimisticLockException() {
      // Given: A subject exists
      Subject subject = testData.subject(school).withName("Mathematics").persist();
      entityManager.flush();
      entityManager.clear();

      // When: Two users load the same entity
      Subject user1View = subjectRepository.findById(subject.getId()).orElseThrow();
      entityManager.detach(user1View);

      Subject user2View = subjectRepository.findById(subject.getId()).orElseThrow();

      // And: User 2 updates first
      user2View.setName("Math");
      subjectRepository.saveAndFlush(user2View);
      entityManager.clear();

      // Then: User 1's stale update should fail
      user1View.setName("Maths");
      assertThatThrownBy(() -> subjectRepository.saveAndFlush(user1View))
          .isInstanceOf(ObjectOptimisticLockingFailureException.class);
    }
  }
}
