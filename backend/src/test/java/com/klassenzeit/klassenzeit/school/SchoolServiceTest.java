package com.klassenzeit.klassenzeit.school;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.dto.CreateSchoolRequest;
import com.klassenzeit.klassenzeit.school.dto.SchoolResponse;
import com.klassenzeit.klassenzeit.school.dto.SchoolSummary;
import com.klassenzeit.klassenzeit.school.dto.UpdateSchoolRequest;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class SchoolServiceTest extends AbstractIntegrationTest {

  @Autowired private SchoolService schoolService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
  }

  @Nested
  class FindAll {

    @Test
    void returnsAllSchools() {
      testData.school().withName("School A").withSlug("school-a").persist();
      testData.school().withName("School B").withSlug("school-b").persist();
      entityManager.flush();
      entityManager.clear();

      List<SchoolSummary> result = schoolService.findAll();

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(SchoolSummary::name)
          .containsExactlyInAnyOrder("School A", "School B");
    }

    @Test
    void returnsEmptyListWhenNoSchools() {
      List<SchoolSummary> result = schoolService.findAll();

      assertThat(result).isEmpty();
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsSchoolWhenFound() {
      School school =
          testData
              .school()
              .withName("Test School")
              .withSlug("test-school")
              .withSchoolType("Grundschule")
              .persist();
      entityManager.flush();
      entityManager.clear();

      SchoolResponse result = schoolService.findById(school.getId());

      assertThat(result.id()).isEqualTo(school.getId());
      assertThat(result.name()).isEqualTo("Test School");
      assertThat(result.slug()).isEqualTo("test-school");
      assertThat(result.schoolType()).isEqualTo("Grundschule");
      assertThat(result.createdAt()).isNotNull();
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> schoolService.findById(nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }
  }

  @Nested
  class Create {

    @Test
    void createsSchoolSuccessfully() {
      CreateSchoolRequest request =
          new CreateSchoolRequest(
              "New School",
              "new-school",
              "Grundschule",
              (short) 1,
              (short) 4,
              "Europe/Berlin",
              null);

      SchoolResponse result = schoolService.create(request);

      assertThat(result.id()).isNotNull();
      assertThat(result.name()).isEqualTo("New School");
      assertThat(result.slug()).isEqualTo("new-school");
      assertThat(result.schoolType()).isEqualTo("Grundschule");
      assertThat(result.minGrade()).isEqualTo((short) 1);
      assertThat(result.maxGrade()).isEqualTo((short) 4);
      assertThat(result.timezone()).isEqualTo("Europe/Berlin");
    }

    @Test
    void usesDefaultTimezoneWhenNotProvided() {
      CreateSchoolRequest request =
          new CreateSchoolRequest(
              "New School", "new-school", "Grundschule", (short) 1, (short) 4, null, null);

      SchoolResponse result = schoolService.create(request);

      assertThat(result.timezone()).isEqualTo("Europe/Berlin");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      School school = testData.school().withName("Old Name").withSlug("old-slug").persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolRequest request =
          new UpdateSchoolRequest(
              "New Name", "new-slug", "Gymnasium", (short) 5, (short) 13, "Europe/London", "{}");

      SchoolResponse result = schoolService.update(school.getId(), request);

      assertThat(result.name()).isEqualTo("New Name");
      assertThat(result.slug()).isEqualTo("new-slug");
      assertThat(result.schoolType()).isEqualTo("Gymnasium");
      assertThat(result.minGrade()).isEqualTo((short) 5);
      assertThat(result.maxGrade()).isEqualTo((short) 13);
      assertThat(result.timezone()).isEqualTo("Europe/London");
    }

    @Test
    void updatesOnlyProvidedFields() {
      School school =
          testData
              .school()
              .withName("Old Name")
              .withSlug("old-slug")
              .withSchoolType("Grundschule")
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolRequest request =
          new UpdateSchoolRequest("New Name", null, null, null, null, null, null);

      SchoolResponse result = schoolService.update(school.getId(), request);

      assertThat(result.name()).isEqualTo("New Name");
      assertThat(result.slug()).isEqualTo("old-slug"); // unchanged
      assertThat(result.schoolType()).isEqualTo("Grundschule"); // unchanged
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateSchoolRequest request =
          new UpdateSchoolRequest("New Name", null, null, null, null, null, null);

      assertThatThrownBy(() -> schoolService.update(nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesSchool() {
      School school = testData.school().withSlug("to-delete").persist();
      UUID schoolId = school.getId();
      entityManager.flush();
      entityManager.clear();

      schoolService.delete(schoolId);

      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> schoolService.findById(schoolId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> schoolService.delete(nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
