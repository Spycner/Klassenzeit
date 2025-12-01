package com.klassenzeit.klassenzeit.room;

import com.klassenzeit.klassenzeit.room.dto.CreateRoomRequest;
import com.klassenzeit.klassenzeit.room.dto.RoomResponse;
import com.klassenzeit.klassenzeit.room.dto.RoomSummary;
import com.klassenzeit.klassenzeit.room.dto.UpdateRoomRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for Room entities. */
@RestController
@RequestMapping("/api/schools/{schoolId}/rooms")
public class RoomController {

  private final RoomService roomService;

  public RoomController(RoomService roomService) {
    this.roomService = roomService;
  }

  @GetMapping
  public List<RoomSummary> findAll(@PathVariable UUID schoolId) {
    return roomService.findAllBySchool(schoolId);
  }

  @GetMapping("/{id}")
  public RoomResponse findById(@PathVariable UUID schoolId, @PathVariable UUID id) {
    return roomService.findById(schoolId, id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public RoomResponse create(
      @PathVariable UUID schoolId, @Valid @RequestBody CreateRoomRequest request) {
    return roomService.create(schoolId, request);
  }

  @PutMapping("/{id}")
  public RoomResponse update(
      @PathVariable UUID schoolId,
      @PathVariable UUID id,
      @Valid @RequestBody UpdateRoomRequest request) {
    return roomService.update(schoolId, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable UUID schoolId, @PathVariable UUID id) {
    roomService.delete(schoolId, id);
  }
}
