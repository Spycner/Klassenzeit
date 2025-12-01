package com.klassenzeit.klassenzeit.timeslot;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolRepository;
import com.klassenzeit.klassenzeit.timeslot.dto.CreateTimeSlotRequest;
import com.klassenzeit.klassenzeit.timeslot.dto.TimeSlotResponse;
import com.klassenzeit.klassenzeit.timeslot.dto.TimeSlotSummary;
import com.klassenzeit.klassenzeit.timeslot.dto.UpdateTimeSlotRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for TimeSlot operations. */
@Service
@Transactional(readOnly = true)
public class TimeSlotService {

  private final TimeSlotRepository timeSlotRepository;
  private final SchoolRepository schoolRepository;

  public TimeSlotService(TimeSlotRepository timeSlotRepository, SchoolRepository schoolRepository) {
    this.timeSlotRepository = timeSlotRepository;
    this.schoolRepository = schoolRepository;
  }

  public List<TimeSlotSummary> findAllBySchool(UUID schoolId) {
    return timeSlotRepository.findBySchoolIdOrderByDayOfWeekAscPeriodAsc(schoolId).stream()
        .map(this::toSummary)
        .toList();
  }

  public TimeSlotResponse findById(UUID schoolId, UUID id) {
    TimeSlot timeSlot =
        timeSlotRepository
            .findById(id)
            .filter(t -> t.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("TimeSlot", id));
    return toResponse(timeSlot);
  }

  @Transactional
  public TimeSlotResponse create(UUID schoolId, CreateTimeSlotRequest request) {
    School school =
        schoolRepository
            .findById(schoolId)
            .orElseThrow(() -> new EntityNotFoundException("School", schoolId));

    TimeSlot timeSlot = new TimeSlot();
    timeSlot.setSchool(school);
    timeSlot.setDayOfWeek(request.dayOfWeek());
    timeSlot.setPeriod(request.period());
    timeSlot.setStartTime(request.startTime());
    timeSlot.setEndTime(request.endTime());
    if (request.isBreak() != null) {
      timeSlot.setBreak(request.isBreak());
    }
    timeSlot.setLabel(request.label());

    return toResponse(timeSlotRepository.save(timeSlot));
  }

  @Transactional
  public TimeSlotResponse update(UUID schoolId, UUID id, UpdateTimeSlotRequest request) {
    TimeSlot timeSlot =
        timeSlotRepository
            .findById(id)
            .filter(t -> t.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("TimeSlot", id));

    if (request.dayOfWeek() != null) {
      timeSlot.setDayOfWeek(request.dayOfWeek());
    }
    if (request.period() != null) {
      timeSlot.setPeriod(request.period());
    }
    if (request.startTime() != null) {
      timeSlot.setStartTime(request.startTime());
    }
    if (request.endTime() != null) {
      timeSlot.setEndTime(request.endTime());
    }
    if (request.isBreak() != null) {
      timeSlot.setBreak(request.isBreak());
    }
    if (request.label() != null) {
      timeSlot.setLabel(request.label());
    }

    return toResponse(timeSlotRepository.save(timeSlot));
  }

  @Transactional
  public void delete(UUID schoolId, UUID id) {
    TimeSlot timeSlot =
        timeSlotRepository
            .findById(id)
            .filter(t -> t.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("TimeSlot", id));
    timeSlotRepository.delete(timeSlot);
  }

  private TimeSlotResponse toResponse(TimeSlot t) {
    return new TimeSlotResponse(
        t.getId(),
        t.getDayOfWeek(),
        t.getPeriod(),
        t.getStartTime(),
        t.getEndTime(),
        t.isBreak(),
        t.getLabel(),
        t.getCreatedAt(),
        t.getUpdatedAt());
  }

  private TimeSlotSummary toSummary(TimeSlot t) {
    return new TimeSlotSummary(
        t.getId(), t.getDayOfWeek(), t.getPeriod(), t.getStartTime(), t.getEndTime());
  }
}
