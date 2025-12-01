package com.klassenzeit.klassenzeit.solver.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.klassenzeit.klassenzeit.common.AvailabilityType;
import com.klassenzeit.klassenzeit.lesson.Lesson;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.solver.domain.PlanningLesson;
import com.klassenzeit.klassenzeit.solver.domain.PlanningRoom;
import com.klassenzeit.klassenzeit.solver.domain.PlanningSchoolClass;
import com.klassenzeit.klassenzeit.solver.domain.PlanningSubject;
import com.klassenzeit.klassenzeit.solver.domain.PlanningTeacher;
import com.klassenzeit.klassenzeit.solver.domain.PlanningTimeSlot;
import com.klassenzeit.klassenzeit.solver.domain.Timetable;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.teacher.TeacherAvailability;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Converts between JPA entities and Timefold planning domain. */
@Component
public class TimetableMapper {

  private final ObjectMapper objectMapper;

  public TimetableMapper(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  // ========== JPA to Planning Domain ==========

  /** Creates a Timetable planning solution from JPA entities. */
  public Timetable toTimetable(
      Term term,
      List<TimeSlot> timeSlotEntities,
      List<Room> roomEntities,
      List<Teacher> teacherEntities,
      List<SchoolClass> schoolClassEntities,
      List<Subject> subjectEntities,
      List<Lesson> lessonEntities) {

    // Convert problem facts
    List<PlanningTimeSlot> timeSlots =
        timeSlotEntities.stream()
            .filter(ts -> !ts.isBreak()) // Exclude breaks from value range
            .map(this::toPlanningTimeSlot)
            .toList();

    List<PlanningRoom> rooms =
        roomEntities.stream().filter(Room::isActive).map(this::toPlanningRoom).toList();

    List<PlanningSubject> subjects = subjectEntities.stream().map(this::toPlanningSubject).toList();

    List<PlanningSchoolClass> schoolClasses =
        schoolClassEntities.stream()
            .filter(SchoolClass::isActive)
            .map(this::toPlanningSchoolClass)
            .toList();

    List<PlanningTeacher> teachers =
        teacherEntities.stream()
            .filter(Teacher::isActive)
            .map(t -> toPlanningTeacher(t, term.getId()))
            .toList();

    // Create lookup maps for lesson conversion
    Map<UUID, PlanningTimeSlot> timeSlotMap =
        timeSlots.stream().collect(Collectors.toMap(PlanningTimeSlot::getId, Function.identity()));
    Map<UUID, PlanningRoom> roomMap =
        rooms.stream().collect(Collectors.toMap(PlanningRoom::getId, Function.identity()));
    Map<UUID, PlanningTeacher> teacherMap =
        teachers.stream().collect(Collectors.toMap(PlanningTeacher::getId, Function.identity()));
    Map<UUID, PlanningSchoolClass> classMap =
        schoolClasses.stream()
            .collect(Collectors.toMap(PlanningSchoolClass::getId, Function.identity()));
    Map<UUID, PlanningSubject> subjectMap =
        subjects.stream().collect(Collectors.toMap(PlanningSubject::getId, Function.identity()));

    // Convert lessons
    List<PlanningLesson> lessons =
        lessonEntities.stream()
            .map(l -> toPlanningLesson(l, timeSlotMap, roomMap, teacherMap, classMap, subjectMap))
            .toList();

    return new Timetable(
        term.getId(), timeSlots, rooms, teachers, schoolClasses, subjects, lessons);
  }

  public PlanningTimeSlot toPlanningTimeSlot(TimeSlot entity) {
    return new PlanningTimeSlot(
        entity.getId(),
        entity.getDayOfWeek(),
        entity.getPeriod(),
        entity.getStartTime(),
        entity.getEndTime(),
        entity.isBreak());
  }

  public PlanningRoom toPlanningRoom(Room entity) {
    Set<String> features = parseFeatures(entity.getFeatures());
    return new PlanningRoom(entity.getId(), entity.getName(), entity.getCapacity(), features);
  }

  public PlanningSubject toPlanningSubject(Subject entity) {
    return new PlanningSubject(entity.getId(), entity.getName(), entity.getAbbreviation());
  }

  public PlanningSchoolClass toPlanningSchoolClass(SchoolClass entity) {
    UUID classTeacherId =
        entity.getClassTeacher() != null ? entity.getClassTeacher().getId() : null;
    return new PlanningSchoolClass(
        entity.getId(),
        entity.getName(),
        entity.getGradeLevel(),
        entity.getStudentCount(),
        classTeacherId);
  }

  public PlanningTeacher toPlanningTeacher(Teacher entity, UUID termId) {
    // Build blocked/preferred slot sets
    Set<String> blockedSlots = new HashSet<>();
    Set<String> preferredSlots = new HashSet<>();

    for (TeacherAvailability avail : entity.getAvailabilities()) {
      // Include global availability (term == null) and term-specific
      if (avail.getTerm() == null || avail.getTerm().getId().equals(termId)) {
        String key = avail.getDayOfWeek() + "-" + avail.getPeriod();
        if (avail.getAvailabilityType() == AvailabilityType.BLOCKED) {
          blockedSlots.add(key);
        } else if (avail.getAvailabilityType() == AvailabilityType.PREFERRED) {
          preferredSlots.add(key);
        }
      }
    }

    // Build qualification map
    Map<UUID, Set<Integer>> qualifiedSubjectGrades =
        entity.getQualifications().stream()
            .collect(
                Collectors.toMap(
                    qual -> qual.getSubject().getId(),
                    qual ->
                        qual.getCanTeachGrades() != null
                            ? Set.copyOf(qual.getCanTeachGrades())
                            : Set.of()));

    return new PlanningTeacher(
        entity.getId(),
        entity.getFullName(),
        entity.getAbbreviation(),
        entity.getMaxHoursPerWeek(),
        blockedSlots,
        preferredSlots,
        qualifiedSubjectGrades);
  }

  public PlanningLesson toPlanningLesson(
      Lesson entity,
      Map<UUID, PlanningTimeSlot> timeSlotMap,
      Map<UUID, PlanningRoom> roomMap,
      Map<UUID, PlanningTeacher> teacherMap,
      Map<UUID, PlanningSchoolClass> classMap,
      Map<UUID, PlanningSubject> subjectMap) {

    PlanningTimeSlot timeSlot =
        entity.getTimeslot() != null ? timeSlotMap.get(entity.getTimeslot().getId()) : null;
    PlanningRoom room = entity.getRoom() != null ? roomMap.get(entity.getRoom().getId()) : null;

    return new PlanningLesson(
        entity.getId(),
        classMap.get(entity.getSchoolClass().getId()),
        teacherMap.get(entity.getTeacher().getId()),
        subjectMap.get(entity.getSubject().getId()),
        entity.getWeekPattern(),
        timeSlot,
        room);
  }

  // ========== Planning Domain to JPA ==========

  /**
   * Applies the solved timetable back to JPA lesson entities. Returns a map of lessonId ->
   * (timeSlotId, roomId) for updates.
   */
  public Map<UUID, LessonAssignment> extractAssignments(Timetable solution) {
    return solution.getLessons().stream()
        .collect(
            Collectors.toMap(
                PlanningLesson::getId,
                lesson ->
                    new LessonAssignment(
                        lesson.getTimeSlot() != null ? lesson.getTimeSlot().getId() : null,
                        lesson.getRoom() != null ? lesson.getRoom().getId() : null)));
  }

  /** DTO for lesson assignments. */
  public record LessonAssignment(UUID timeSlotId, UUID roomId) {}

  // ========== Helper Methods ==========

  private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};

  private Set<String> parseFeatures(String featuresJson) {
    if (featuresJson == null || featuresJson.isBlank() || "[]".equals(featuresJson)) {
      return Set.of();
    }
    try {
      List<String> featureList = objectMapper.readValue(featuresJson, STRING_LIST_TYPE);
      return new HashSet<>(featureList);
    } catch (JsonProcessingException e) {
      return Set.of();
    }
  }
}
