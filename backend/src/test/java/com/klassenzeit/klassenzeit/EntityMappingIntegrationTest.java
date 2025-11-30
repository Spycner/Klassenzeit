package com.klassenzeit.klassenzeit;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.common.AvailabilityType;
import com.klassenzeit.klassenzeit.common.QualificationLevel;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.lesson.Lesson;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolYear;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.teacher.TeacherAvailability;
import com.klassenzeit.klassenzeit.teacher.TeacherSubjectQualification;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

/** Integration tests verifying Flyway migrations and JPA entity mappings. */
@Transactional
class EntityMappingIntegrationTest extends AbstractIntegrationTest {

  @Autowired private EntityManager entityManager;

  @Test
  void flywayMigrationsRunSuccessfully() {
    // If we reach here without exception, Flyway migrations ran successfully
    assertThat(entityManager).isNotNull();
  }

  @Test
  void canPersistAndRetrieveSchool() {
    School school = new School();
    school.setName("Grundschule Test");
    school.setSlug("grundschule-test");
    school.setSchoolType("Grundschule");
    school.setMinGrade((short) 1);
    school.setMaxGrade((short) 4);
    school.setTimezone("Europe/Berlin");

    entityManager.persist(school);
    entityManager.flush();
    entityManager.clear();

    School found = entityManager.find(School.class, school.getId());
    assertThat(found).isNotNull();
    assertThat(found.getName()).isEqualTo("Grundschule Test");
    assertThat(found.getSlug()).isEqualTo("grundschule-test");
    assertThat(found.getSchoolType()).isEqualTo("Grundschule");
    assertThat(found.getMinGrade()).isEqualTo((short) 1);
    assertThat(found.getMaxGrade()).isEqualTo((short) 4);
    assertThat(found.getCreatedAt()).isNotNull();
    assertThat(found.getUpdatedAt()).isNotNull();
  }

  @Test
  void canPersistAndRetrieveSchoolYearAndTerm() {
    School school = createSchool("test-school-year");
    entityManager.persist(school);

    SchoolYear schoolYear = new SchoolYear();
    schoolYear.setSchool(school);
    schoolYear.setName("2024/2025");
    schoolYear.setStartDate(LocalDate.of(2024, 8, 1));
    schoolYear.setEndDate(LocalDate.of(2025, 7, 31));
    schoolYear.setCurrent(true);
    entityManager.persist(schoolYear);

    Term term = new Term();
    term.setSchoolYear(schoolYear);
    term.setName("1. Halbjahr");
    term.setStartDate(LocalDate.of(2024, 8, 1));
    term.setEndDate(LocalDate.of(2025, 1, 31));
    term.setCurrent(true);
    entityManager.persist(term);

    entityManager.flush();
    entityManager.clear();

    Term found = entityManager.find(Term.class, term.getId());
    assertThat(found).isNotNull();
    assertThat(found.getName()).isEqualTo("1. Halbjahr");
    assertThat(found.getSchoolYear().getName()).isEqualTo("2024/2025");
    assertThat(found.getSchoolYear().getSchool().getSlug()).isEqualTo("test-school-year");
  }

  @Test
  void canPersistAndRetrieveTeacher() {
    School school = createSchool("test-teacher");
    entityManager.persist(school);

    Teacher teacher = new Teacher();
    teacher.setSchool(school);
    teacher.setFirstName("Max");
    teacher.setLastName("Mustermann");
    teacher.setEmail("max@example.com");
    teacher.setAbbreviation("MUS");
    teacher.setMaxHoursPerWeek(28);
    teacher.setPartTime(false);
    entityManager.persist(teacher);

    entityManager.flush();
    entityManager.clear();

    Teacher found = entityManager.find(Teacher.class, teacher.getId());
    assertThat(found).isNotNull();
    assertThat(found.getFullName()).isEqualTo("Max Mustermann");
    assertThat(found.getAbbreviation()).isEqualTo("MUS");
    assertThat(found.isActive()).isTrue();
  }

  @Test
  void canPersistAndRetrieveSubject() {
    School school = createSchool("test-subject");
    entityManager.persist(school);

    Subject subject = new Subject();
    subject.setSchool(school);
    subject.setName("Mathematik");
    subject.setAbbreviation("MA");
    subject.setColor("#3498db");
    entityManager.persist(subject);

    entityManager.flush();
    entityManager.clear();

    Subject found = entityManager.find(Subject.class, subject.getId());
    assertThat(found).isNotNull();
    assertThat(found.getName()).isEqualTo("Mathematik");
    assertThat(found.getColor()).isEqualTo("#3498db");
  }

  @Test
  void canPersistAndRetrieveRoom() {
    School school = createSchool("test-room");
    entityManager.persist(school);

    Room room = new Room();
    room.setSchool(school);
    room.setName("Raum 101");
    room.setBuilding("Hauptgebäude");
    room.setCapacity(30);
    room.setFeatures("[\"projector\", \"whiteboard\"]");
    entityManager.persist(room);

    entityManager.flush();
    entityManager.clear();

    Room found = entityManager.find(Room.class, room.getId());
    assertThat(found).isNotNull();
    assertThat(found.getName()).isEqualTo("Raum 101");
    assertThat(found.getCapacity()).isEqualTo(30);
    assertThat(found.getFeatures()).contains("projector");
  }

  @Test
  void canPersistAndRetrieveSchoolClass() {
    School school = createSchool("test-class");
    entityManager.persist(school);

    Teacher teacher = createTeacher(school, "KLA");
    entityManager.persist(teacher);

    SchoolClass schoolClass = new SchoolClass();
    schoolClass.setSchool(school);
    schoolClass.setName("3a");
    schoolClass.setGradeLevel((short) 3);
    schoolClass.setStudentCount(25);
    schoolClass.setClassTeacher(teacher);
    entityManager.persist(schoolClass);

    entityManager.flush();
    entityManager.clear();

    SchoolClass found = entityManager.find(SchoolClass.class, schoolClass.getId());
    assertThat(found).isNotNull();
    assertThat(found.getName()).isEqualTo("3a");
    assertThat(found.getGradeLevel()).isEqualTo((short) 3);
    assertThat(found.getClassTeacher().getAbbreviation()).isEqualTo("KLA");
  }

  @Test
  void canPersistAndRetrieveTimeSlot() {
    School school = createSchool("test-timeslot");
    entityManager.persist(school);

    TimeSlot timeSlot = new TimeSlot();
    timeSlot.setSchool(school);
    timeSlot.setDayOfWeek((short) 0); // Monday
    timeSlot.setPeriod((short) 1);
    timeSlot.setStartTime(LocalTime.of(8, 0));
    timeSlot.setEndTime(LocalTime.of(8, 45));
    timeSlot.setBreak(false);
    timeSlot.setLabel("1. Stunde");
    entityManager.persist(timeSlot);

    entityManager.flush();
    entityManager.clear();

    TimeSlot found = entityManager.find(TimeSlot.class, timeSlot.getId());
    assertThat(found).isNotNull();
    assertThat(found.getDayName()).isEqualTo("Monday");
    assertThat(found.getStartTime()).isEqualTo(LocalTime.of(8, 0));
  }

  @Test
  void canPersistAndRetrieveTeacherSubjectQualification() {
    School school = createSchool("test-qualification");
    entityManager.persist(school);

    Teacher teacher = createTeacher(school, "QUA");
    entityManager.persist(teacher);

    Subject subject = new Subject();
    subject.setSchool(school);
    subject.setName("Deutsch");
    subject.setAbbreviation("DE");
    entityManager.persist(subject);

    TeacherSubjectQualification qualification = new TeacherSubjectQualification();
    qualification.setTeacher(teacher);
    qualification.setSubject(subject);
    qualification.setQualificationLevel(QualificationLevel.PRIMARY);
    qualification.setCanTeachGrades(List.of(1, 2, 3, 4));
    qualification.setMaxHoursPerWeek(10);
    entityManager.persist(qualification);

    entityManager.flush();
    entityManager.clear();

    TeacherSubjectQualification found =
        entityManager.find(TeacherSubjectQualification.class, qualification.getId());
    assertThat(found).isNotNull();
    assertThat(found.getQualificationLevel()).isEqualTo(QualificationLevel.PRIMARY);
    assertThat(found.getCanTeachGrades()).containsExactly(1, 2, 3, 4);
  }

  @Test
  void canPersistAndRetrieveTeacherAvailability() {
    School school = createSchool("test-availability");
    entityManager.persist(school);

    Teacher teacher = createTeacher(school, "AVA");
    entityManager.persist(teacher);

    TeacherAvailability availability = new TeacherAvailability();
    availability.setTeacher(teacher);
    availability.setTerm(null); // Global availability
    availability.setDayOfWeek((short) 0);
    availability.setPeriod((short) 1);
    availability.setAvailabilityType(AvailabilityType.BLOCKED);
    availability.setReason("Teilzeit");
    entityManager.persist(availability);

    entityManager.flush();
    entityManager.clear();

    TeacherAvailability found = entityManager.find(TeacherAvailability.class, availability.getId());
    assertThat(found).isNotNull();
    assertThat(found.getAvailabilityType()).isEqualTo(AvailabilityType.BLOCKED);
    assertThat(found.isGlobal()).isTrue();
  }

  @Test
  void canPersistAndRetrieveLesson() {
    // Setup: School -> SchoolYear -> Term
    School school = createSchool("test-lesson");
    entityManager.persist(school);

    SchoolYear schoolYear = new SchoolYear();
    schoolYear.setSchool(school);
    schoolYear.setName("2024/2025");
    schoolYear.setStartDate(LocalDate.of(2024, 8, 1));
    schoolYear.setEndDate(LocalDate.of(2025, 7, 31));
    entityManager.persist(schoolYear);

    Term term = new Term();
    term.setSchoolYear(schoolYear);
    term.setName("1. Halbjahr");
    term.setStartDate(LocalDate.of(2024, 8, 1));
    term.setEndDate(LocalDate.of(2025, 1, 31));
    entityManager.persist(term);

    // Setup: Teacher, Subject, Room, SchoolClass, TimeSlot
    Teacher teacher = createTeacher(school, "LES");
    entityManager.persist(teacher);

    Subject subject = new Subject();
    subject.setSchool(school);
    subject.setName("Musik");
    subject.setAbbreviation("MU");
    entityManager.persist(subject);

    Room room = new Room();
    room.setSchool(school);
    room.setName("Musikraum");
    entityManager.persist(room);

    SchoolClass schoolClass = new SchoolClass();
    schoolClass.setSchool(school);
    schoolClass.setName("4b");
    schoolClass.setGradeLevel((short) 4);
    entityManager.persist(schoolClass);

    TimeSlot timeSlot = new TimeSlot();
    timeSlot.setSchool(school);
    timeSlot.setDayOfWeek((short) 2); // Wednesday
    timeSlot.setPeriod((short) 3);
    timeSlot.setStartTime(LocalTime.of(10, 0));
    timeSlot.setEndTime(LocalTime.of(10, 45));
    entityManager.persist(timeSlot);

    // Create Lesson
    Lesson lesson = new Lesson();
    lesson.setTerm(term);
    lesson.setSchoolClass(schoolClass);
    lesson.setTeacher(teacher);
    lesson.setSubject(subject);
    lesson.setRoom(room);
    lesson.setTimeslot(timeSlot);
    lesson.setWeekPattern(WeekPattern.EVERY);
    entityManager.persist(lesson);

    entityManager.flush();
    entityManager.clear();

    Lesson found = entityManager.find(Lesson.class, lesson.getId());
    assertThat(found).isNotNull();
    assertThat(found.getSubject().getName()).isEqualTo("Musik");
    assertThat(found.getSchoolClass().getName()).isEqualTo("4b");
    assertThat(found.getTeacher().getAbbreviation()).isEqualTo("LES");
    assertThat(found.getRoom().getName()).isEqualTo("Musikraum");
    assertThat(found.getWeekPattern()).isEqualTo(WeekPattern.EVERY);
  }

  // Helper methods
  private School createSchool(String slug) {
    School school = new School();
    school.setName("Test School " + slug);
    school.setSlug(slug);
    school.setSchoolType("Grundschule");
    school.setMinGrade((short) 1);
    school.setMaxGrade((short) 4);
    school.setTimezone("Europe/Berlin");
    return school;
  }

  private Teacher createTeacher(School school, String abbreviation) {
    Teacher teacher = new Teacher();
    teacher.setSchool(school);
    teacher.setFirstName("Test");
    teacher.setLastName("Teacher");
    teacher.setAbbreviation(abbreviation);
    teacher.setMaxHoursPerWeek(28);
    return teacher;
  }
}
