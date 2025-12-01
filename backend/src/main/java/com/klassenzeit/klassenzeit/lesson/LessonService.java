package com.klassenzeit.klassenzeit.lesson;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.lesson.dto.CreateLessonRequest;
import com.klassenzeit.klassenzeit.lesson.dto.LessonResponse;
import com.klassenzeit.klassenzeit.lesson.dto.LessonSummary;
import com.klassenzeit.klassenzeit.lesson.dto.UpdateLessonRequest;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.room.RoomRepository;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.school.TermRepository;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClassRepository;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.subject.SubjectRepository;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.teacher.TeacherRepository;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import com.klassenzeit.klassenzeit.timeslot.TimeSlotRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service for Lesson operations. */
@Service
@Transactional(readOnly = true)
public class LessonService {

  private final LessonRepository lessonRepository;
  private final TermRepository termRepository;
  private final SchoolClassRepository schoolClassRepository;
  private final TeacherRepository teacherRepository;
  private final SubjectRepository subjectRepository;
  private final RoomRepository roomRepository;
  private final TimeSlotRepository timeSlotRepository;

  public LessonService(
      LessonRepository lessonRepository,
      TermRepository termRepository,
      SchoolClassRepository schoolClassRepository,
      TeacherRepository teacherRepository,
      SubjectRepository subjectRepository,
      RoomRepository roomRepository,
      TimeSlotRepository timeSlotRepository) {
    this.lessonRepository = lessonRepository;
    this.termRepository = termRepository;
    this.schoolClassRepository = schoolClassRepository;
    this.teacherRepository = teacherRepository;
    this.subjectRepository = subjectRepository;
    this.roomRepository = roomRepository;
    this.timeSlotRepository = timeSlotRepository;
  }

  public List<LessonSummary> findAllByTerm(UUID schoolId, UUID termId) {
    validateTerm(schoolId, termId);
    return lessonRepository.findByTermIdWithAssociations(termId).stream()
        .map(this::toSummary)
        .toList();
  }

  public LessonResponse findById(UUID schoolId, UUID termId, UUID id) {
    validateTerm(schoolId, termId);
    Lesson lesson =
        lessonRepository
            .findById(id)
            .filter(l -> l.getTerm().getId().equals(termId))
            .orElseThrow(() -> new EntityNotFoundException("Lesson", id));
    return toResponse(lesson);
  }

  @Transactional
  public LessonResponse create(UUID schoolId, UUID termId, CreateLessonRequest request) {
    Term term = validateTerm(schoolId, termId);

    SchoolClass schoolClass =
        schoolClassRepository
            .findById(request.schoolClassId())
            .filter(c -> c.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("SchoolClass", request.schoolClassId()));

    Teacher teacher =
        teacherRepository
            .findById(request.teacherId())
            .filter(t -> t.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Teacher", request.teacherId()));

    Subject subject =
        subjectRepository
            .findById(request.subjectId())
            .filter(s -> s.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("Subject", request.subjectId()));

    TimeSlot timeslot =
        timeSlotRepository
            .findById(request.timeslotId())
            .filter(ts -> ts.getSchool().getId().equals(schoolId))
            .orElseThrow(() -> new EntityNotFoundException("TimeSlot", request.timeslotId()));

    Lesson lesson = new Lesson();
    lesson.setTerm(term);
    lesson.setSchoolClass(schoolClass);
    lesson.setTeacher(teacher);
    lesson.setSubject(subject);
    lesson.setTimeslot(timeslot);

    if (request.roomId() != null) {
      Room room =
          roomRepository
              .findById(request.roomId())
              .filter(r -> r.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("Room", request.roomId()));
      lesson.setRoom(room);
    }

    if (request.weekPattern() != null) {
      lesson.setWeekPattern(request.weekPattern());
    }

    return toResponse(lessonRepository.save(lesson));
  }

  @Transactional
  public LessonResponse update(UUID schoolId, UUID termId, UUID id, UpdateLessonRequest request) {
    validateTerm(schoolId, termId);
    Lesson lesson =
        lessonRepository
            .findById(id)
            .filter(l -> l.getTerm().getId().equals(termId))
            .orElseThrow(() -> new EntityNotFoundException("Lesson", id));

    if (request.schoolClassId() != null) {
      SchoolClass schoolClass =
          schoolClassRepository
              .findById(request.schoolClassId())
              .filter(c -> c.getSchool().getId().equals(schoolId))
              .orElseThrow(
                  () -> new EntityNotFoundException("SchoolClass", request.schoolClassId()));
      lesson.setSchoolClass(schoolClass);
    }

    if (request.teacherId() != null) {
      Teacher teacher =
          teacherRepository
              .findById(request.teacherId())
              .filter(t -> t.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("Teacher", request.teacherId()));
      lesson.setTeacher(teacher);
    }

    if (request.subjectId() != null) {
      Subject subject =
          subjectRepository
              .findById(request.subjectId())
              .filter(s -> s.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("Subject", request.subjectId()));
      lesson.setSubject(subject);
    }

    if (request.timeslotId() != null) {
      TimeSlot timeslot =
          timeSlotRepository
              .findById(request.timeslotId())
              .filter(ts -> ts.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("TimeSlot", request.timeslotId()));
      lesson.setTimeslot(timeslot);
    }

    if (request.roomId() != null) {
      Room room =
          roomRepository
              .findById(request.roomId())
              .filter(r -> r.getSchool().getId().equals(schoolId))
              .orElseThrow(() -> new EntityNotFoundException("Room", request.roomId()));
      lesson.setRoom(room);
    }

    if (request.weekPattern() != null) {
      lesson.setWeekPattern(request.weekPattern());
    }

    return toResponse(lessonRepository.save(lesson));
  }

  @Transactional
  public void delete(UUID schoolId, UUID termId, UUID id) {
    validateTerm(schoolId, termId);
    Lesson lesson =
        lessonRepository
            .findById(id)
            .filter(l -> l.getTerm().getId().equals(termId))
            .orElseThrow(() -> new EntityNotFoundException("Lesson", id));
    lessonRepository.delete(lesson);
  }

  private Term validateTerm(UUID schoolId, UUID termId) {
    Term term =
        termRepository
            .findById(termId)
            .orElseThrow(() -> new EntityNotFoundException("Term", termId));
    if (!term.getSchoolYear().getSchool().getId().equals(schoolId)) {
      throw new EntityNotFoundException("Term", termId);
    }
    return term;
  }

  private LessonResponse toResponse(Lesson l) {
    TimeSlot ts = l.getTimeslot();
    Room room = l.getRoom();
    return new LessonResponse(
        l.getId(),
        l.getSchoolClass().getId(),
        l.getSchoolClass().getName(),
        l.getTeacher().getId(),
        l.getTeacher().getFullName(),
        l.getSubject().getId(),
        l.getSubject().getName(),
        ts.getId(),
        ts.getDayOfWeek(),
        ts.getPeriod(),
        ts.getStartTime(),
        ts.getEndTime(),
        room != null ? room.getId() : null,
        room != null ? room.getName() : null,
        l.getWeekPattern(),
        l.getCreatedAt(),
        l.getUpdatedAt(),
        l.getVersion());
  }

  private LessonSummary toSummary(Lesson l) {
    TimeSlot ts = l.getTimeslot();
    Room room = l.getRoom();
    return new LessonSummary(
        l.getId(),
        l.getSchoolClass().getName(),
        l.getTeacher().getFullName(),
        l.getSubject().getName(),
        ts.getDayOfWeek(),
        ts.getPeriod(),
        ts.getStartTime(),
        ts.getEndTime(),
        room != null ? room.getName() : null,
        l.getWeekPattern());
  }
}
