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
import com.klassenzeit.klassenzeit.security.WithMockCurrentUser;
import com.klassenzeit.klassenzeit.user.AppUser;
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
  private AppUser adminUser;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    // Create a user that can be the initial school admin
    adminUser = testData.appUser().withEmail("admin@example.com").persist();
    entityManager.flush();
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
    @WithMockCurrentUser(isPlatformAdmin = true)
    void createsSchoolSuccessfully() {
      CreateSchoolRequest request =
          new CreateSchoolRequest(
              "New School",
              "new-school",
              "Grundschule",
              (short) 1,
              (short) 4,
              "Europe/Berlin",
              null,
              adminUser.getId());

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
    @WithMockCurrentUser(isPlatformAdmin = true)
    void usesDefaultTimezoneWhenNotProvided() {
      CreateSchoolRequest request =
          new CreateSchoolRequest(
              "New School",
              "new-school",
              "Grundschule",
              (short) 1,
              (short) 4,
              null,
              null,
              adminUser.getId());

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

  @Nested
  class FindBySlug {

    @Test
    void returnsSchoolWhenFoundByCurrentSlug() {
      School school = testData.school().withName("Test School").withSlug("test-school").persist();
      entityManager.flush();
      entityManager.clear();

      SchoolResponse result = schoolService.findBySlug("test-school");

      assertThat(result.id()).isEqualTo(school.getId());
      assertThat(result.name()).isEqualTo("Test School");
      assertThat(result.slug()).isEqualTo("test-school");
    }

    @Test
    void throwsRedirectExceptionForOldSlug() {
      School school = testData.school().withSlug("new-slug").persist();
      testData.slugHistory(school).withSlug("old-slug").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> schoolService.findBySlug("old-slug"))
          .isInstanceOf(SlugRedirectException.class)
          .satisfies(
              ex -> {
                SlugRedirectException redirect = (SlugRedirectException) ex;
                assertThat(redirect.getNewSlug()).isEqualTo("new-slug");
                assertThat(redirect.getSchoolId()).isEqualTo(school.getId());
              });
    }

    @Test
    void throwsNotFoundForUnknownSlug() {
      assertThatThrownBy(() -> schoolService.findBySlug("unknown-slug"))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }
  }

  @Nested
  class FindByIdentifier {

    @Test
    void returnsSchoolWhenFoundByUuid() {
      School school = testData.school().withName("Test School").withSlug("test-school").persist();
      entityManager.flush();
      entityManager.clear();

      SchoolResponse result = schoolService.findByIdentifier(school.getId().toString());

      assertThat(result.id()).isEqualTo(school.getId());
      assertThat(result.name()).isEqualTo("Test School");
    }

    @Test
    void returnsSchoolWhenFoundBySlug() {
      School school = testData.school().withName("Test School").withSlug("test-school").persist();
      entityManager.flush();
      entityManager.clear();

      SchoolResponse result = schoolService.findByIdentifier("test-school");

      assertThat(result.id()).isEqualTo(school.getId());
      assertThat(result.name()).isEqualTo("Test School");
    }

    @Test
    void throwsRedirectExceptionForOldSlug() {
      School school = testData.school().withSlug("current-slug").persist();
      testData.slugHistory(school).withSlug("previous-slug").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> schoolService.findByIdentifier("previous-slug"))
          .isInstanceOf(SlugRedirectException.class)
          .satisfies(
              ex -> {
                SlugRedirectException redirect = (SlugRedirectException) ex;
                assertThat(redirect.getNewSlug()).isEqualTo("current-slug");
              });
    }

    @Test
    void throwsNotFoundForUnknownIdentifier() {
      assertThatThrownBy(() -> schoolService.findByIdentifier("unknown"))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class SlugHistory {

    @Test
    void savesOldSlugToHistoryWhenSlugChanges() {
      School school = testData.school().withSlug("original-slug").persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolRequest request =
          new UpdateSchoolRequest(null, "updated-slug", null, null, null, null, null);
      schoolService.update(school.getId(), request);
      entityManager.flush();
      entityManager.clear();

      // Old slug should redirect to new slug
      assertThatThrownBy(() -> schoolService.findBySlug("original-slug"))
          .isInstanceOf(SlugRedirectException.class)
          .satisfies(
              ex -> {
                SlugRedirectException redirect = (SlugRedirectException) ex;
                assertThat(redirect.getNewSlug()).isEqualTo("updated-slug");
              });

      // New slug should work
      SchoolResponse result = schoolService.findBySlug("updated-slug");
      assertThat(result.slug()).isEqualTo("updated-slug");
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void removesSlugFromHistoryWhenNewSchoolClaimsIt() {
      // Create first school with slug, then change it
      School school1 = testData.school().withSlug("claimed-slug").persist();
      entityManager.flush();
      entityManager.clear();

      UpdateSchoolRequest updateRequest =
          new UpdateSchoolRequest(null, "school1-new-slug", null, null, null, null, null);
      schoolService.update(school1.getId(), updateRequest);
      entityManager.flush();
      entityManager.clear();

      // Verify old slug redirects
      assertThatThrownBy(() -> schoolService.findBySlug("claimed-slug"))
          .isInstanceOf(SlugRedirectException.class);

      // Create new school with the old slug
      CreateSchoolRequest createRequest =
          new CreateSchoolRequest(
              "New School",
              "claimed-slug",
              "Grundschule",
              (short) 1,
              (short) 4,
              null,
              null,
              adminUser.getId());
      SchoolResponse newSchool = schoolService.create(createRequest);
      entityManager.flush();
      entityManager.clear();

      // Old slug should now go to new school, not redirect
      SchoolResponse result = schoolService.findBySlug("claimed-slug");
      assertThat(result.id()).isEqualTo(newSchool.id());
    }

    @Test
    void doesNotAddToHistoryWhenSlugUnchanged() {
      School school = testData.school().withSlug("unchanged-slug").persist();
      entityManager.flush();
      entityManager.clear();

      // Update with same slug
      UpdateSchoolRequest request =
          new UpdateSchoolRequest("New Name", "unchanged-slug", null, null, null, null, null);
      schoolService.update(school.getId(), request);
      entityManager.flush();
      entityManager.clear();

      // Should not throw redirect (no history entry)
      SchoolResponse result = schoolService.findBySlug("unchanged-slug");
      assertThat(result.name()).isEqualTo("New Name");
    }
  }
}
