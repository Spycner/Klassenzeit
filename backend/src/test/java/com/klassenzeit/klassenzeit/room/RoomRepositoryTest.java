package com.klassenzeit.klassenzeit.room;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.school.School;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class RoomRepositoryTest extends AbstractIntegrationTest {

  @Autowired private RoomRepository roomRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
  }

  @Test
  void findBySchoolId_existingSchool_returnsRooms() {
    testData.room(school).withName("Room 101").persist();
    testData.room(school).withName("Room 102").persist();

    School otherSchool = testData.school().withSlug("other").persist();
    testData.room(otherSchool).withName("Room 201").persist();

    entityManager.flush();
    entityManager.clear();

    List<Room> found = roomRepository.findBySchoolId(school.getId());

    assertThat(found).hasSize(2);
    assertThat(found).extracting(Room::getName).containsExactlyInAnyOrder("Room 101", "Room 102");
  }

  @Test
  void findBySchoolIdAndIsActiveTrue_mixedRooms_returnsOnlyActive() {
    testData.room(school).withName("Active Room").isActive(true).persist();
    testData.room(school).withName("Inactive Room").isActive(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<Room> found = roomRepository.findBySchoolIdAndIsActiveTrue(school.getId());

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getName()).isEqualTo("Active Room");
  }

  @Test
  void findBySchoolIdAndIsActiveFalse_mixedRooms_returnsOnlyInactive() {
    testData.room(school).withName("Active Room").isActive(true).persist();
    testData.room(school).withName("Inactive Room").isActive(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<Room> found = roomRepository.findBySchoolIdAndIsActiveFalse(school.getId());

    assertThat(found).hasSize(1);
    assertThat(found.get(0).getName()).isEqualTo("Inactive Room");
  }

  @Test
  void findBySchoolIdAndCapacityGreaterThanEqual_minCapacity_returnsLargeRooms() {
    testData.room(school).withName("Small").withCapacity(20).persist();
    testData.room(school).withName("Medium").withCapacity(30).persist();
    testData.room(school).withName("Large").withCapacity(40).persist();
    entityManager.flush();
    entityManager.clear();

    List<Room> found = roomRepository.findBySchoolIdAndCapacityGreaterThanEqual(school.getId(), 30);

    assertThat(found).hasSize(2);
    assertThat(found).extracting(Room::getName).containsExactlyInAnyOrder("Medium", "Large");
  }

  @Test
  void findBySchoolIdAndName_existingRoom_returnsRoom() {
    testData.room(school).withName("Room 101").persist();
    entityManager.flush();
    entityManager.clear();

    Optional<Room> found = roomRepository.findBySchoolIdAndName(school.getId(), "Room 101");

    assertThat(found).isPresent();
    assertThat(found.get().getName()).isEqualTo("Room 101");
  }

  @Test
  void findBySchoolIdAndName_nonExistentRoom_returnsEmpty() {
    entityManager.flush();
    entityManager.clear();

    Optional<Room> found = roomRepository.findBySchoolIdAndName(school.getId(), "Room 101");

    assertThat(found).isEmpty();
  }

  @Test
  void existsBySchoolIdAndName_existingRoom_returnsTrue() {
    testData.room(school).withName("Room 101").persist();
    entityManager.flush();

    boolean exists = roomRepository.existsBySchoolIdAndName(school.getId(), "Room 101");

    assertThat(exists).isTrue();
  }

  @Test
  void existsBySchoolIdAndName_nonExistentRoom_returnsFalse() {
    entityManager.flush();

    boolean exists = roomRepository.existsBySchoolIdAndName(school.getId(), "Room 101");

    assertThat(exists).isFalse();
  }

  @Test
  void findBySchoolIdAndBuilding_specificBuilding_returnsBuildingRooms() {
    testData.room(school).withName("Room A1").withBuilding("Building A").persist();
    testData.room(school).withName("Room A2").withBuilding("Building A").persist();
    testData.room(school).withName("Room B1").withBuilding("Building B").persist();
    entityManager.flush();
    entityManager.clear();

    List<Room> found = roomRepository.findBySchoolIdAndBuilding(school.getId(), "Building A");

    assertThat(found).hasSize(2);
    assertThat(found).extracting(Room::getName).containsExactlyInAnyOrder("Room A1", "Room A2");
  }

  @Test
  void findBySchoolIdAndIsActiveTrueOrderByNameAsc_multipleRooms_returnsSorted() {
    testData.room(school).withName("Room C").isActive(true).persist();
    testData.room(school).withName("Room A").isActive(true).persist();
    testData.room(school).withName("Room B").isActive(true).persist();
    testData.room(school).withName("Inactive").isActive(false).persist();
    entityManager.flush();
    entityManager.clear();

    List<Room> found = roomRepository.findBySchoolIdAndIsActiveTrueOrderByNameAsc(school.getId());

    assertThat(found).hasSize(3);
    assertThat(found).extracting(Room::getName).containsExactly("Room A", "Room B", "Room C");
  }
}
