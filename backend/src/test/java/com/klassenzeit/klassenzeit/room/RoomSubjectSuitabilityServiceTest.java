package com.klassenzeit.klassenzeit.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.room.dto.CreateRoomSubjectSuitabilityRequest;
import com.klassenzeit.klassenzeit.room.dto.RoomSubjectSuitabilitySummary;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.subject.Subject;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class RoomSubjectSuitabilityServiceTest extends AbstractIntegrationTest {

  @Autowired private RoomSubjectSuitabilityService suitabilityService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private Room room;
  private Subject subject;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    room = testData.room(school).withName("Chemistry Lab").persist();
    subject = testData.subject(school).withName("Chemistry").withAbbreviation("CH").persist();
  }

  @Nested
  class FindAllByRoom {

    @Test
    void returnsAllSuitabilitiesForRoom() {
      Subject subject2 =
          testData.subject(school).withName("Physics").withAbbreviation("PH").persist();
      testData.roomSuitability(room, subject).persist();
      testData.roomSuitability(room, subject2).persist();
      entityManager.flush();
      entityManager.clear();

      List<RoomSubjectSuitabilitySummary> result =
          suitabilityService.findAllByRoom(school.getId(), room.getId());

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(RoomSubjectSuitabilitySummary::subjectName)
          .containsExactlyInAnyOrder("Chemistry", "Physics");
    }

    @Test
    void doesNotReturnSuitabilitiesFromOtherRoom() {
      testData.roomSuitability(room, subject).persist();

      Room otherRoom = testData.room(school).withName("Room 101").persist();
      Subject otherSubject =
          testData.subject(school).withName("Math").withAbbreviation("MA").persist();
      testData.roomSuitability(otherRoom, otherSubject).persist();
      entityManager.flush();
      entityManager.clear();

      List<RoomSubjectSuitabilitySummary> result =
          suitabilityService.findAllByRoom(school.getId(), room.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).subjectName()).isEqualTo("Chemistry");
    }

    @Test
    void returnsEmptyListWhenNoSuitabilities() {
      entityManager.flush();
      entityManager.clear();

      List<RoomSubjectSuitabilitySummary> result =
          suitabilityService.findAllByRoom(school.getId(), room.getId());

      assertThat(result).isEmpty();
    }

    @Test
    void throwsWhenRoomBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Room otherRoom = testData.room(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> suitabilityService.findAllByRoom(school.getId(), otherRoom.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Room");
    }
  }

  @Nested
  class Create {

    @Test
    void createsSuitabilitySuccessfully() {
      entityManager.flush();
      entityManager.clear();

      CreateRoomSubjectSuitabilityRequest request =
          new CreateRoomSubjectSuitabilityRequest(subject.getId(), false, null);

      RoomSubjectSuitabilitySummary result =
          suitabilityService.create(school.getId(), room.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.subjectId()).isEqualTo(subject.getId());
      assertThat(result.subjectName()).isEqualTo("Chemistry");
      assertThat(result.isRequired()).isFalse();
    }

    @Test
    void createsSuitabilityWithIsRequiredTrue() {
      entityManager.flush();
      entityManager.clear();

      CreateRoomSubjectSuitabilityRequest request =
          new CreateRoomSubjectSuitabilityRequest(subject.getId(), true, "Lab equipment required");

      RoomSubjectSuitabilitySummary result =
          suitabilityService.create(school.getId(), room.getId(), request);

      assertThat(result.isRequired()).isTrue();
    }

    @Test
    void throwsWhenRoomNotFound() {
      UUID nonExistentRoomId = UUID.randomUUID();
      CreateRoomSubjectSuitabilityRequest request =
          new CreateRoomSubjectSuitabilityRequest(subject.getId(), false, null);

      assertThatThrownBy(
              () -> suitabilityService.create(school.getId(), nonExistentRoomId, request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Room");
    }

    @Test
    void throwsWhenSubjectNotFound() {
      UUID nonExistentSubjectId = UUID.randomUUID();
      CreateRoomSubjectSuitabilityRequest request =
          new CreateRoomSubjectSuitabilityRequest(nonExistentSubjectId, false, null);

      assertThatThrownBy(() -> suitabilityService.create(school.getId(), room.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Subject");
    }

    @Test
    void throwsWhenSubjectBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Subject otherSubject =
          testData.subject(otherSchool).withName("English").withAbbreviation("EN").persist();
      entityManager.flush();
      entityManager.clear();

      CreateRoomSubjectSuitabilityRequest request =
          new CreateRoomSubjectSuitabilityRequest(otherSubject.getId(), false, null);

      assertThatThrownBy(() -> suitabilityService.create(school.getId(), room.getId(), request))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Subject");
    }

    @Test
    void throwsWhenSuitabilityAlreadyExists() {
      testData.roomSuitability(room, subject).persist();
      entityManager.flush();
      entityManager.clear();

      CreateRoomSubjectSuitabilityRequest request =
          new CreateRoomSubjectSuitabilityRequest(subject.getId(), false, null);

      assertThatThrownBy(() -> suitabilityService.create(school.getId(), room.getId(), request))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("already exists");
    }
  }

  @Nested
  class Delete {

    @Test
    void deletesSuitability() {
      RoomSubjectSuitability suitability = testData.roomSuitability(room, subject).persist();
      UUID suitabilityId = suitability.getId();
      entityManager.flush();
      entityManager.clear();

      suitabilityService.delete(school.getId(), room.getId(), suitabilityId);

      entityManager.flush();
      entityManager.clear();

      List<RoomSubjectSuitabilitySummary> result =
          suitabilityService.findAllByRoom(school.getId(), room.getId());
      assertThat(result).isEmpty();
    }

    @Test
    void throwsWhenSuitabilityNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(
              () -> suitabilityService.delete(school.getId(), room.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenSuitabilityBelongsToDifferentRoom() {
      Room otherRoom = testData.room(school).withName("Room 101").persist();
      RoomSubjectSuitability suitability = testData.roomSuitability(otherRoom, subject).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> suitabilityService.delete(school.getId(), room.getId(), suitability.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
