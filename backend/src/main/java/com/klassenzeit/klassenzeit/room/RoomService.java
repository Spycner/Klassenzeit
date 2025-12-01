package com.klassenzeit.klassenzeit.room;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.room.dto.CreateRoomRequest;
import com.klassenzeit.klassenzeit.room.dto.RoomResponse;
import com.klassenzeit.klassenzeit.room.dto.RoomSummary;
import com.klassenzeit.klassenzeit.room.dto.UpdateRoomRequest;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for Room operations. */
@Service
@Transactional(readOnly = true)
public class RoomService {

  private final RoomRepository roomRepository;
  private final SchoolRepository schoolRepository;

  public RoomService(RoomRepository roomRepository, SchoolRepository schoolRepository) {
    this.roomRepository = roomRepository;
    this.schoolRepository = schoolRepository;
  }

  public List<RoomSummary> findAllBySchool(UUID schoolId) {
    return roomRepository.findBySchoolId(schoolId).stream().map(this::toSummary).toList();
  }

  public RoomResponse findById(UUID schoolId, UUID id) {
    Room room =
        roomRepository
            .findById(id)
            .filter(r -> r.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Room", id));
    return toResponse(room);
  }

  @Transactional
  public RoomResponse create(UUID schoolId, CreateRoomRequest request) {
    School school =
        schoolRepository
            .findById(schoolId)
            .orElseThrow(() -> new EntityNotFoundException("School", schoolId));

    Room room = new Room();
    room.setSchool(school);
    room.setName(request.name());
    room.setBuilding(request.building());
    room.setCapacity(request.capacity());
    if (request.features() != null) {
      room.setFeatures(request.features());
    }

    return toResponse(roomRepository.save(room));
  }

  @Transactional
  public RoomResponse update(UUID schoolId, UUID id, UpdateRoomRequest request) {
    Room room =
        roomRepository
            .findById(id)
            .filter(r -> r.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Room", id));

    if (request.name() != null) {
      room.setName(request.name());
    }
    if (request.building() != null) {
      room.setBuilding(request.building());
    }
    if (request.capacity() != null) {
      room.setCapacity(request.capacity());
    }
    if (request.features() != null) {
      room.setFeatures(request.features());
    }
    if (request.isActive() != null) {
      room.setActive(request.isActive());
    }

    return toResponse(roomRepository.save(room));
  }

  @Transactional
  public void delete(UUID schoolId, UUID id) {
    Room room =
        roomRepository
            .findById(id)
            .filter(r -> r.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Room", id));
    room.setActive(false);
    roomRepository.save(room);
  }

  private RoomResponse toResponse(Room r) {
    return new RoomResponse(
        r.getId(),
        r.getName(),
        r.getBuilding(),
        r.getCapacity(),
        r.getFeatures(),
        r.isActive(),
        r.getCreatedAt(),
        r.getUpdatedAt(),
        r.getVersion());
  }

  private RoomSummary toSummary(Room r) {
    return new RoomSummary(r.getId(), r.getName(), r.getBuilding(), r.getCapacity(), r.isActive());
  }
}
