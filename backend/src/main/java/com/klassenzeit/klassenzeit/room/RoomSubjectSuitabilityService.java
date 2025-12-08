package com.klassenzeit.klassenzeit.room;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.room.dto.CreateRoomSubjectSuitabilityRequest;
import com.klassenzeit.klassenzeit.room.dto.RoomSubjectSuitabilitySummary;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.subject.SubjectRepository;
import com.klassenzeit.klassenzeit.subject.dto.AddRoomToSubjectRequest;
import com.klassenzeit.klassenzeit.subject.dto.SubjectRoomSummary;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for RoomSubjectSuitability operations. */
@Service
@Transactional(readOnly = true)
public class RoomSubjectSuitabilityService {

  private final RoomSubjectSuitabilityRepository suitabilityRepository;
  private final RoomRepository roomRepository;
  private final SubjectRepository subjectRepository;

  public RoomSubjectSuitabilityService(
      RoomSubjectSuitabilityRepository suitabilityRepository,
      RoomRepository roomRepository,
      SubjectRepository subjectRepository) {
    this.suitabilityRepository = suitabilityRepository;
    this.roomRepository = roomRepository;
    this.subjectRepository = subjectRepository;
  }

  public List<RoomSubjectSuitabilitySummary> findAllByRoom(UUID schoolId, UUID roomId) {
    validateRoom(schoolId, roomId);
    return suitabilityRepository.findByRoomIdWithSubject(roomId).stream()
        .map(this::toSummary)
        .toList();
  }

  @Transactional
  public RoomSubjectSuitabilitySummary create(
      UUID schoolId, UUID roomId, CreateRoomSubjectSuitabilityRequest request) {
    Room room = validateRoom(schoolId, roomId);

    Subject subject =
        subjectRepository
            .findById(request.subjectId())
            .filter(s -> s.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Subject", request.subjectId()));

    // Check for existing suitability
    if (suitabilityRepository.existsByRoomIdAndSubjectId(roomId, request.subjectId())) {
      throw new IllegalStateException(
          "Subject suitability already exists for this room and subject");
    }

    RoomSubjectSuitability suitability = new RoomSubjectSuitability();
    suitability.setRoom(room);
    suitability.setSubject(subject);
    suitability.setNotes(request.notes());

    return toSummary(suitabilityRepository.save(suitability));
  }

  @Transactional
  public void delete(UUID schoolId, UUID roomId, UUID id) {
    validateRoom(schoolId, roomId);
    RoomSubjectSuitability suitability =
        suitabilityRepository
            .findById(id)
            .filter(s -> s.getRoom().getId().equals(roomId))
            .orElseThrow(() -> new EntityNotFoundException("RoomSubjectSuitability", id));
    suitabilityRepository.delete(suitability);
  }

  // --- Subject-to-Rooms API methods ---

  public List<SubjectRoomSummary> findRoomsForSubject(UUID schoolId, UUID subjectId) {
    validateSubject(schoolId, subjectId);
    return suitabilityRepository.findBySubjectIdWithRoom(subjectId).stream()
        .map(this::toSubjectRoomSummary)
        .toList();
  }

  @Transactional
  public SubjectRoomSummary addRoomToSubject(
      UUID schoolId, UUID subjectId, AddRoomToSubjectRequest request) {
    Subject subject = validateSubject(schoolId, subjectId);

    Room room =
        roomRepository
            .findById(request.roomId())
            .filter(r -> r.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Room", request.roomId()));

    // Check for existing suitability
    if (suitabilityRepository.existsByRoomIdAndSubjectId(request.roomId(), subjectId)) {
      throw new IllegalStateException("Room is already assigned to this subject");
    }

    RoomSubjectSuitability suitability = new RoomSubjectSuitability();
    suitability.setRoom(room);
    suitability.setSubject(subject);
    suitability.setNotes(request.notes());

    suitability = suitabilityRepository.save(suitability);
    return new SubjectRoomSummary(
        suitability.getId(), room.getId(), room.getName(), room.getBuilding());
  }

  @Transactional
  public void removeRoomFromSubject(UUID schoolId, UUID subjectId, UUID roomId) {
    validateSubject(schoolId, subjectId);

    suitabilityRepository
        .findByRoomIdAndSubjectId(roomId, subjectId)
        .orElseThrow(() -> new EntityNotFoundException("RoomSubjectSuitability for room", roomId));

    suitabilityRepository.deleteByRoomIdAndSubjectId(roomId, subjectId);
  }

  private Subject validateSubject(UUID schoolId, UUID subjectId) {
    return subjectRepository
        .findById(subjectId)
        .filter(s -> s.getSchool().getId().equals(schoolId))
        .orElseThrow(() -> new EntityNotFoundException("Subject", subjectId));
  }

  private Room validateRoom(UUID schoolId, UUID roomId) {
    return roomRepository
        .findById(roomId)
        .filter(r -> r.getSchool().getId().equals(schoolId))
        .orElseThrow(() -> new EntityNotFoundException("Room", roomId));
  }

  private RoomSubjectSuitabilitySummary toSummary(RoomSubjectSuitability s) {
    return new RoomSubjectSuitabilitySummary(
        s.getId(), s.getSubject().getId(), s.getSubject().getName(), s.getSubject().getColor());
  }

  private SubjectRoomSummary toSubjectRoomSummary(RoomSubjectSuitability s) {
    return new SubjectRoomSummary(
        s.getId(), s.getRoom().getId(), s.getRoom().getName(), s.getRoom().getBuilding());
  }
}
