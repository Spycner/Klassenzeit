package com.klassenzeit.klassenzeit.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.room.dto.CreateRoomRequest;
import com.klassenzeit.klassenzeit.room.dto.RoomResponse;
import com.klassenzeit.klassenzeit.room.dto.RoomSummary;
import com.klassenzeit.klassenzeit.room.dto.UpdateRoomRequest;
import com.klassenzeit.klassenzeit.school.School;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class RoomServiceTest extends AbstractIntegrationTest {

  @Autowired private RoomService roomService;
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
    void returnsAllRoomsForSchool() {
      testData.room(school).withName("Room 101").persist();
      testData.room(school).withName("Room 102").persist();
      entityManager.flush();
      entityManager.clear();

      List<RoomSummary> result = roomService.findAllBySchool(school.getId());

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(RoomSummary::name)
          .containsExactlyInAnyOrder("Room 101", "Room 102");
    }

    @Test
    void doesNotReturnRoomsFromOtherSchool() {
      testData.room(school).withName("Room 101").persist();

      School otherSchool = testData.school().withSlug("other-school").persist();
      testData.room(otherSchool).withName("Room 201").persist();
      entityManager.flush();
      entityManager.clear();

      List<RoomSummary> result = roomService.findAllBySchool(school.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).name()).isEqualTo("Room 101");
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsRoomWhenFound() {
      Room room = testData.room(school).withName("Room 101").withCapacity(30).persist();
      entityManager.flush();
      entityManager.clear();

      RoomResponse result = roomService.findById(school.getId(), room.getId());

      assertThat(result.id()).isEqualTo(room.getId());
      assertThat(result.name()).isEqualTo("Room 101");
      assertThat(result.capacity()).isEqualTo(30);
    }

    @Test
    void throwsWhenRoomNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> roomService.findById(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenRoomBelongsToDifferentSchool() {
      School otherSchool = testData.school().withSlug("other-school").persist();
      Room room = testData.room(otherSchool).withName("Room 201").persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> roomService.findById(school.getId(), room.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsRoomSuccessfully() {
      CreateRoomRequest request = new CreateRoomRequest("Room 101", "Building A", 30, null);

      RoomResponse result = roomService.create(school.getId(), request);

      assertThat(result.id()).isNotNull();
      assertThat(result.name()).isEqualTo("Room 101");
      assertThat(result.building()).isEqualTo("Building A");
      assertThat(result.capacity()).isEqualTo(30);
      assertThat(result.isActive()).isTrue();
    }

    @Test
    void throwsWhenSchoolNotFound() {
      UUID nonExistentSchoolId = UUID.randomUUID();
      CreateRoomRequest request = new CreateRoomRequest("Room 101", null, null, null);

      assertThatThrownBy(() -> roomService.create(nonExistentSchoolId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Update {

    @Test
    void updatesAllFields() {
      Room room = testData.room(school).withName("Room 101").withCapacity(30).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateRoomRequest request =
          new UpdateRoomRequest("Room 102", "Building B", 40, null, false, null);

      RoomResponse result = roomService.update(school.getId(), room.getId(), request);

      assertThat(result.name()).isEqualTo("Room 102");
      assertThat(result.building()).isEqualTo("Building B");
      assertThat(result.capacity()).isEqualTo(40);
      assertThat(result.isActive()).isFalse();
    }

    @Test
    void updatesOnlyProvidedFields() {
      Room room =
          testData
              .room(school)
              .withName("Room 101")
              .withBuilding("Building A")
              .withCapacity(30)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateRoomRequest request = new UpdateRoomRequest("Room 102", null, null, null, null, null);

      RoomResponse result = roomService.update(school.getId(), room.getId(), request);

      assertThat(result.name()).isEqualTo("Room 102");
      assertThat(result.building()).isEqualTo("Building A"); // unchanged
      assertThat(result.capacity()).isEqualTo(30); // unchanged
    }

    @Test
    void throwsWhenRoomNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateRoomRequest request = new UpdateRoomRequest("Updated", null, null, null, null, null);

      assertThatThrownBy(() -> roomService.update(school.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void softDeletesRoom() {
      Room room = testData.room(school).withName("Room 101").persist();
      entityManager.flush();
      entityManager.clear();

      roomService.delete(school.getId(), room.getId());

      entityManager.flush();
      entityManager.clear();

      RoomResponse result = roomService.findById(school.getId(), room.getId());
      assertThat(result.isActive()).isFalse();
    }

    @Test
    void throwsWhenRoomNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> roomService.delete(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }
}
