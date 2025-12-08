package com.klassenzeit.klassenzeit.room;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

public interface RoomSubjectSuitabilityRepository
    extends JpaRepository<RoomSubjectSuitability, UUID> {

  List<RoomSubjectSuitability> findByRoomId(UUID roomId);

  List<RoomSubjectSuitability> findBySubjectId(UUID subjectId);

  Optional<RoomSubjectSuitability> findByRoomIdAndSubjectId(UUID roomId, UUID subjectId);

  boolean existsByRoomIdAndSubjectId(UUID roomId, UUID subjectId);

  @Modifying
  @Transactional
  void deleteByRoomIdAndSubjectId(UUID roomId, UUID subjectId);
}
