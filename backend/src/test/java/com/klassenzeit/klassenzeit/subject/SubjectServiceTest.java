package com.klassenzeit.klassenzeit.subject;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.subject.dto.CreateSubjectRequest;
import com.klassenzeit.klassenzeit.subject.dto.SubjectResponse;
import com.klassenzeit.klassenzeit.subject.dto.SubjectSummary;
import com.klassenzeit.klassenzeit.subject.dto.UpdateSubjectRequest;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class SubjectServiceTest extends AbstractIntegrationTest {

  @Autowired private SubjectService subjectService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Nested
  class FindAllBySchool {

    @Test
    void returnsAllSubjectsForSchool() {
      testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
      testData.subject(school).withName("Deutsch").withAbbreviation("DE").persist();
      entityManager.flush();
      entityManager.clear();

      List<SubjectSummary> result = subjectService.findAllBySchool(school.getId());

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(SubjectSummary::name)
          .containsExactlyInAnyOrder("Mathematik", "Deutsch");
    }

    @Test
    void doesNotReturnSubjectsFromOtherSchool() {
      testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();

      School otherSchool = testData.school().withSlug("other-school").persist();
      testData.subject(otherSchool).withName("Englisch").withAbbreviation("EN").persist();
      entityManager.flush();
      entityManager.clear();

      List<SubjectSummary> result = subjectService.findAllBySchool(school.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).name()).isEqualTo("Mathematik");
    }

    @Test
    void returnsEmptyListWhenNoSubjects() {
      entityManager.flush();
      entityManager.clear();

      List<SubjectSummary> result = subjectService.findAllBySchool(school.getId());

      assertThat(result).isEmpty();
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsSubjectWhenFound() {
      Subject subject =
          testData.subject(school).withName("Mathematik").withAbbreviation("MA").persist();
      entityManager.flush();
      entityManager.clear();

      SubjectResponse result = subjectService.findById(school.getId(), subject.getId());

      assertThat(result.id()).isEqualTo(subject.getId());
      assertThat(result.name()).isEqualTo("Mathematik");
      assertThat(result.abbreviation()).isEqualTo("MA");
      assertThat(result.createdAt()).isNotNull();
      assertThat(result.updatedAt()).isNotNull();
    }

    @Test
    void throwsWhenSubjectNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> subjectService.findById(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Subject")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenSubjectBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Subject subject =
          testData.subject(otherSchool).withName("Englisch").withAbbreviation("EN").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> subjectService.findById(school.getId(), subject.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsSubjectSuccessfully() {
      CreateSubjectRequest request = new CreateSubjectRequest("Mathematik", "MA", "#FF0000");

      SubjectResponse result = subjectService.create(school.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.name()).isEqualTo("Mathematik");
      assertThat(result.abbreviation()).isEqualTo("MA");
      assertThat(result.color()).isEqualTo("#FF0000");
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void createsSubjectWithNullColor() {
      CreateSubjectRequest request = new CreateSubjectRequest("Mathematik", "MA", null);

      SubjectResponse result = subjectService.create(school.getId(), request);

      assertThat(result.name()).isEqualTo("Mathematik");
      assertThat(result.color()).isNull();
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentSchoolId = UUID.randomUUID();
      CreateSubjectRequest request = new CreateSubjectRequest("Mathematik", "MA", null);

      assertThatThrownBy(() -> subjectService.create(nonExistentSchoolId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      Subject subject =
          testData
              .subject(school)
              .withName("Mathematik")
              .withAbbreviation("MA")
              .withColor("#000000")
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSubjectRequest request = new UpdateSubjectRequest("Mathe", "MTH", "#FF0000");

      SubjectResponse result = subjectService.update(school.getId(), subject.getId(), request);

      assertThat(result.name()).isEqualTo("Mathe");
      assertThat(result.abbreviation()).isEqualTo("MTH");
      assertThat(result.color()).isEqualTo("#FF0000");
    }

    @Test
    void updatesOnlyProvidedFields() {
      Subject subject =
          testData
              .subject(school)
              .withName("Mathematik")
              .withAbbreviation("MA")
              .withColor("#000000")
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSubjectRequest request = new UpdateSubjectRequest("Mathe", null, null);

      SubjectResponse result = subjectService.update(school.getId(), subject.getId(), request);

      assertThat(result.name()).isEqualTo("Mathe");
      assertThat(result.abbreviation()).isEqualTo("MA"); // unchanged
      assertThat(result.color()).isEqualTo("#000000"); // unchanged
    }

    @Test
    void throwsWhenSubjectNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateSubjectRequest request = new UpdateSubjectRequest("Mathe", null, null);

      assertThatThrownBy(() -> subjectService.update(school.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSubjectBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Subject subject = testData.subject(otherSchool).withAbbreviation("EN").persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSubjectRequest request = new UpdateSubjectRequest("Updated", null, null);

      assertThatThrownBy(() -> subjectService.update(school.getId(), subject.getId(), request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesSubject() {
      Subject subject = testData.subject(school).withAbbreviation("MA").persist();
      UUID subjectId = subject.getId();
      entityManager.flush();
      entityManager.clear();

      subjectService.delete(school.getId(), subjectId);

      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> subjectService.findById(school.getId(), subjectId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSubjectNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> subjectService.delete(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSubjectBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Subject subject = testData.subject(otherSchool).withAbbreviation("EN").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> subjectService.delete(school.getId(), subject.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
