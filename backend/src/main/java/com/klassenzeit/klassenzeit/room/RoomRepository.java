package com.klassenzeit.klassenzeit.room;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomRepository extends JpaRepository<Room, UUID> {

  List<Room> findBySchoolId(UUID schoolId);

  List<Room> findBySchoolIdAndIsActiveTrue(UUID schoolId);

  List<Room> findBySchoolIdAndIsActiveFalse(UUID schoolId);

  List<Room> findBySchoolIdAndCapacityGreaterThanEqual(UUID schoolId, Integer minCapacity);

  Optional<Room> findBySchoolIdAndName(UUID schoolId, String name);

  boolean existsBySchoolIdAndName(UUID schoolId, String name);

  List<Room> findBySchoolIdAndBuilding(UUID schoolId, String building);

  List<Room> findBySchoolIdAndIsActiveTrueOrderByNameAsc(UUID schoolId);
}
