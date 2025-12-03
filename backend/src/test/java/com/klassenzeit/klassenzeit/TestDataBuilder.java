package com.klassenzeit.klassenzeit;

import com.klassenzeit.klassenzeit.common.AvailabilityType;
import com.klassenzeit.klassenzeit.common.QualificationLevel;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.lesson.Lesson;
import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
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
import com.klassenzeit.klassenzeit.user.AppUser;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/**
 * Fluent test data builder for creating test entities.
 *
 * <p>Usage:
 *
 * <pre>{@code
 * TestDataBuilder testData = new TestDataBuilder(entityManager);
 * School school = testData.school().withSlug("my-school").persist();
 * Teacher teacher = testData.teacher(school).withAbbreviation("MUS").persist();
 * }</pre>
 */
public class TestDataBuilder {

  private final EntityManager entityManager;

  public TestDataBuilder(EntityManager entityManager) {
    this.entityManager = entityManager;
  }

  public SchoolBuilder school() {
    return new SchoolBuilder();
  }

  public SchoolYearBuilder schoolYear(School school) {
    return new SchoolYearBuilder(school);
  }

  public TermBuilder term(SchoolYear schoolYear) {
    return new TermBuilder(schoolYear);
  }

  public TeacherBuilder teacher(School school) {
    return new TeacherBuilder(school);
  }

  public SubjectBuilder subject(School school) {
    return new SubjectBuilder(school);
  }

  public RoomBuilder room(School school) {
    return new RoomBuilder(school);
  }

  public SchoolClassBuilder schoolClass(School school) {
    return new SchoolClassBuilder(school);
  }

  public TimeSlotBuilder timeSlot(School school) {
    return new TimeSlotBuilder(school);
  }

  public TeacherSubjectQualificationBuilder qualification(Teacher teacher, Subject subject) {
    return new TeacherSubjectQualificationBuilder(teacher, subject);
  }

  public TeacherAvailabilityBuilder availability(Teacher teacher) {
    return new TeacherAvailabilityBuilder(teacher);
  }

  public LessonBuilder lesson(
      Term term, SchoolClass schoolClass, Teacher teacher, Subject subject, TimeSlot timeSlot) {
    return new LessonBuilder(term, schoolClass, teacher, subject, timeSlot);
  }

  public AppUserBuilder appUser() {
    return new AppUserBuilder();
  }

  public SchoolMembershipBuilder membership(School school, AppUser user) {
    return new SchoolMembershipBuilder(school, user);
  }

  // School Builder
  public class SchoolBuilder {
    private String name = "Test School";
    private String slug = "test-school-" + UUID.randomUUID().toString().substring(0, 8);
    private String schoolType = "Grundschule";
    private short minGrade = 1;
    private short maxGrade = 4;
    private String timezone = "Europe/Berlin";

    public SchoolBuilder withName(String name) {
      this.name = name;
      return this;
    }

    public SchoolBuilder withSlug(String slug) {
      this.slug = slug;
      return this;
    }

    public SchoolBuilder withSchoolType(String schoolType) {
      this.schoolType = schoolType;
      return this;
    }

    public SchoolBuilder withGradeRange(short min, short max) {
      this.minGrade = min;
      this.maxGrade = max;
      return this;
    }

    public School build() {
      School school = new School();
      school.setName(name);
      school.setSlug(slug);
      school.setSchoolType(schoolType);
      school.setMinGrade(minGrade);
      school.setMaxGrade(maxGrade);
      school.setTimezone(timezone);
      return school;
    }

    public School persist() {
      School school = build();
      entityManager.persist(school);
      return school;
    }
  }

  // SchoolYear Builder
  public class SchoolYearBuilder {
    private final School school;
    private String name = "2024/2025";
    private LocalDate startDate = LocalDate.of(2024, 8, 1);
    private LocalDate endDate = LocalDate.of(2025, 7, 31);
    private boolean isCurrent = false;

    public SchoolYearBuilder(School school) {
      this.school = school;
    }

    public SchoolYearBuilder withName(String name) {
      this.name = name;
      return this;
    }

    public SchoolYearBuilder withDates(LocalDate start, LocalDate end) {
      this.startDate = start;
      this.endDate = end;
      return this;
    }

    public SchoolYearBuilder isCurrent(boolean isCurrent) {
      this.isCurrent = isCurrent;
      return this;
    }

    public SchoolYear build() {
      SchoolYear schoolYear = new SchoolYear();
      schoolYear.setSchool(school);
      schoolYear.setName(name);
      schoolYear.setStartDate(startDate);
      schoolYear.setEndDate(endDate);
      schoolYear.setCurrent(isCurrent);
      return schoolYear;
    }

    public SchoolYear persist() {
      SchoolYear schoolYear = build();
      entityManager.persist(schoolYear);
      return schoolYear;
    }
  }

  // Term Builder
  public class TermBuilder {
    private final SchoolYear schoolYear;
    private String name = "1. Halbjahr";
    private LocalDate startDate = LocalDate.of(2024, 8, 1);
    private LocalDate endDate = LocalDate.of(2025, 1, 31);
    private boolean isCurrent = false;

    public TermBuilder(SchoolYear schoolYear) {
      this.schoolYear = schoolYear;
    }

    public TermBuilder withName(String name) {
      this.name = name;
      return this;
    }

    public TermBuilder withDates(LocalDate start, LocalDate end) {
      this.startDate = start;
      this.endDate = end;
      return this;
    }

    public TermBuilder isCurrent(boolean isCurrent) {
      this.isCurrent = isCurrent;
      return this;
    }

    public Term build() {
      Term term = new Term();
      term.setSchoolYear(schoolYear);
      term.setName(name);
      term.setStartDate(startDate);
      term.setEndDate(endDate);
      term.setCurrent(isCurrent);
      return term;
    }

    public Term persist() {
      Term term = build();
      entityManager.persist(term);
      return term;
    }
  }

  // Teacher Builder
  public class TeacherBuilder {
    private final School school;
    private String firstName = "Test";
    private String lastName = "Teacher";
    private String email;
    private String abbreviation =
        "TST" + UUID.randomUUID().toString().substring(0, 2).toUpperCase();
    private int maxHoursPerWeek = 28;
    private boolean isPartTime = false;
    private boolean isActive = true;

    public TeacherBuilder(School school) {
      this.school = school;
    }

    public TeacherBuilder withFirstName(String firstName) {
      this.firstName = firstName;
      return this;
    }

    public TeacherBuilder withLastName(String lastName) {
      this.lastName = lastName;
      return this;
    }

    public TeacherBuilder withEmail(String email) {
      this.email = email;
      return this;
    }

    public TeacherBuilder withAbbreviation(String abbreviation) {
      this.abbreviation = abbreviation;
      return this;
    }

    public TeacherBuilder withMaxHours(int maxHours) {
      this.maxHoursPerWeek = maxHours;
      return this;
    }

    public TeacherBuilder isPartTime(boolean isPartTime) {
      this.isPartTime = isPartTime;
      return this;
    }

    public TeacherBuilder isActive(boolean isActive) {
      this.isActive = isActive;
      return this;
    }

    public Teacher build() {
      Teacher teacher = new Teacher();
      teacher.setSchool(school);
      teacher.setFirstName(firstName);
      teacher.setLastName(lastName);
      teacher.setEmail(email);
      teacher.setAbbreviation(abbreviation);
      teacher.setMaxHoursPerWeek(maxHoursPerWeek);
      teacher.setPartTime(isPartTime);
      teacher.setActive(isActive);
      return teacher;
    }

    public Teacher persist() {
      Teacher teacher = build();
      entityManager.persist(teacher);
      return teacher;
    }
  }

  // Subject Builder
  public class SubjectBuilder {
    private final School school;
    private String name = "Test Subject";
    private String abbreviation =
        "TST" + UUID.randomUUID().toString().substring(0, 2).toUpperCase();
    private String color = "#3498db";

    public SubjectBuilder(School school) {
      this.school = school;
    }

    public SubjectBuilder withName(String name) {
      this.name = name;
      return this;
    }

    public SubjectBuilder withAbbreviation(String abbreviation) {
      this.abbreviation = abbreviation;
      return this;
    }

    public SubjectBuilder withColor(String color) {
      this.color = color;
      return this;
    }

    public Subject build() {
      Subject subject = new Subject();
      subject.setSchool(school);
      subject.setName(name);
      subject.setAbbreviation(abbreviation);
      subject.setColor(color);
      return subject;
    }

    public Subject persist() {
      Subject subject = build();
      entityManager.persist(subject);
      return subject;
    }
  }

  // Room Builder
  public class RoomBuilder {
    private final School school;
    private String name = "Room " + UUID.randomUUID().toString().substring(0, 4);
    private String building;
    private Integer capacity = 30;
    private String features = "[]";
    private boolean isActive = true;

    public RoomBuilder(School school) {
      this.school = school;
    }

    public RoomBuilder withName(String name) {
      this.name = name;
      return this;
    }

    public RoomBuilder withBuilding(String building) {
      this.building = building;
      return this;
    }

    public RoomBuilder withCapacity(Integer capacity) {
      this.capacity = capacity;
      return this;
    }

    public RoomBuilder withFeatures(String features) {
      this.features = features;
      return this;
    }

    public RoomBuilder isActive(boolean isActive) {
      this.isActive = isActive;
      return this;
    }

    public Room build() {
      Room room = new Room();
      room.setSchool(school);
      room.setName(name);
      room.setBuilding(building);
      room.setCapacity(capacity);
      room.setFeatures(features);
      room.setActive(isActive);
      return room;
    }

    public Room persist() {
      Room room = build();
      entityManager.persist(room);
      return room;
    }
  }

  // SchoolClass Builder
  public class SchoolClassBuilder {
    private final School school;
    private String name = "1a";
    private short gradeLevel = 1;
    private Integer studentCount = 25;
    private Teacher classTeacher;
    private boolean isActive = true;

    public SchoolClassBuilder(School school) {
      this.school = school;
    }

    public SchoolClassBuilder withName(String name) {
      this.name = name;
      return this;
    }

    public SchoolClassBuilder withGradeLevel(short gradeLevel) {
      this.gradeLevel = gradeLevel;
      return this;
    }

    public SchoolClassBuilder withStudentCount(Integer studentCount) {
      this.studentCount = studentCount;
      return this;
    }

    public SchoolClassBuilder withClassTeacher(Teacher classTeacher) {
      this.classTeacher = classTeacher;
      return this;
    }

    public SchoolClassBuilder isActive(boolean isActive) {
      this.isActive = isActive;
      return this;
    }

    public SchoolClass build() {
      SchoolClass schoolClass = new SchoolClass();
      schoolClass.setSchool(school);
      schoolClass.setName(name);
      schoolClass.setGradeLevel(gradeLevel);
      schoolClass.setStudentCount(studentCount);
      schoolClass.setClassTeacher(classTeacher);
      schoolClass.setActive(isActive);
      return schoolClass;
    }

    public SchoolClass persist() {
      SchoolClass schoolClass = build();
      entityManager.persist(schoolClass);
      return schoolClass;
    }
  }

  // TimeSlot Builder
  public class TimeSlotBuilder {
    private final School school;
    private short dayOfWeek = 0; // Monday
    private short period = 1;
    private LocalTime startTime = LocalTime.of(8, 0);
    private LocalTime endTime = LocalTime.of(8, 45);
    private boolean isBreak = false;
    private String label;

    public TimeSlotBuilder(School school) {
      this.school = school;
    }

    public TimeSlotBuilder withDayOfWeek(short dayOfWeek) {
      this.dayOfWeek = dayOfWeek;
      return this;
    }

    public TimeSlotBuilder withPeriod(short period) {
      this.period = period;
      return this;
    }

    public TimeSlotBuilder withTimes(LocalTime start, LocalTime end) {
      this.startTime = start;
      this.endTime = end;
      return this;
    }

    public TimeSlotBuilder isBreak(boolean isBreak) {
      this.isBreak = isBreak;
      return this;
    }

    public TimeSlotBuilder withLabel(String label) {
      this.label = label;
      return this;
    }

    public TimeSlot build() {
      TimeSlot timeSlot = new TimeSlot();
      timeSlot.setSchool(school);
      timeSlot.setDayOfWeek(dayOfWeek);
      timeSlot.setPeriod(period);
      timeSlot.setStartTime(startTime);
      timeSlot.setEndTime(endTime);
      timeSlot.setBreak(isBreak);
      timeSlot.setLabel(label);
      return timeSlot;
    }

    public TimeSlot persist() {
      TimeSlot timeSlot = build();
      entityManager.persist(timeSlot);
      return timeSlot;
    }
  }

  // TeacherSubjectQualification Builder
  public class TeacherSubjectQualificationBuilder {
    private final Teacher teacher;
    private final Subject subject;
    private QualificationLevel qualificationLevel = QualificationLevel.PRIMARY;
    private List<Integer> canTeachGrades = List.of(1, 2, 3, 4);
    private Integer maxHoursPerWeek;

    public TeacherSubjectQualificationBuilder(Teacher teacher, Subject subject) {
      this.teacher = teacher;
      this.subject = subject;
    }

    public TeacherSubjectQualificationBuilder withLevel(QualificationLevel level) {
      this.qualificationLevel = level;
      return this;
    }

    public TeacherSubjectQualificationBuilder withGrades(List<Integer> grades) {
      this.canTeachGrades = grades;
      return this;
    }

    public TeacherSubjectQualificationBuilder withMaxHours(Integer maxHours) {
      this.maxHoursPerWeek = maxHours;
      return this;
    }

    public TeacherSubjectQualification build() {
      TeacherSubjectQualification qualification = new TeacherSubjectQualification();
      qualification.setTeacher(teacher);
      qualification.setSubject(subject);
      qualification.setQualificationLevel(qualificationLevel);
      qualification.setCanTeachGrades(canTeachGrades);
      qualification.setMaxHoursPerWeek(maxHoursPerWeek);
      return qualification;
    }

    public TeacherSubjectQualification persist() {
      TeacherSubjectQualification qualification = build();
      entityManager.persist(qualification);
      return qualification;
    }
  }

  // TeacherAvailability Builder
  public class TeacherAvailabilityBuilder {
    private final Teacher teacher;
    private Term term; // null = global
    private short dayOfWeek = 0;
    private short period = 1;
    private AvailabilityType availabilityType = AvailabilityType.AVAILABLE;
    private String reason;

    public TeacherAvailabilityBuilder(Teacher teacher) {
      this.teacher = teacher;
    }

    public TeacherAvailabilityBuilder withTerm(Term term) {
      this.term = term;
      return this;
    }

    public TeacherAvailabilityBuilder global() {
      this.term = null;
      return this;
    }

    public TeacherAvailabilityBuilder withDayOfWeek(short dayOfWeek) {
      this.dayOfWeek = dayOfWeek;
      return this;
    }

    public TeacherAvailabilityBuilder withPeriod(short period) {
      this.period = period;
      return this;
    }

    public TeacherAvailabilityBuilder withType(AvailabilityType type) {
      this.availabilityType = type;
      return this;
    }

    public TeacherAvailabilityBuilder withReason(String reason) {
      this.reason = reason;
      return this;
    }

    public TeacherAvailability build() {
      TeacherAvailability availability = new TeacherAvailability();
      availability.setTeacher(teacher);
      availability.setTerm(term);
      availability.setDayOfWeek(dayOfWeek);
      availability.setPeriod(period);
      availability.setAvailabilityType(availabilityType);
      availability.setReason(reason);
      return availability;
    }

    public TeacherAvailability persist() {
      TeacherAvailability availability = build();
      entityManager.persist(availability);
      return availability;
    }
  }

  // Lesson Builder
  public class LessonBuilder {
    private final Term term;
    private final SchoolClass schoolClass;
    private final Teacher teacher;
    private final Subject subject;
    private final TimeSlot timeSlot;
    private Room room;
    private WeekPattern weekPattern = WeekPattern.EVERY;

    public LessonBuilder(
        Term term, SchoolClass schoolClass, Teacher teacher, Subject subject, TimeSlot timeSlot) {
      this.term = term;
      this.schoolClass = schoolClass;
      this.teacher = teacher;
      this.subject = subject;
      this.timeSlot = timeSlot;
    }

    public LessonBuilder withRoom(Room room) {
      this.room = room;
      return this;
    }

    public LessonBuilder withWeekPattern(WeekPattern weekPattern) {
      this.weekPattern = weekPattern;
      return this;
    }

    public Lesson build() {
      Lesson lesson = new Lesson();
      lesson.setTerm(term);
      lesson.setSchoolClass(schoolClass);
      lesson.setTeacher(teacher);
      lesson.setSubject(subject);
      lesson.setTimeslot(timeSlot);
      lesson.setRoom(room);
      lesson.setWeekPattern(weekPattern);
      return lesson;
    }

    public Lesson persist() {
      Lesson lesson = build();
      entityManager.persist(lesson);
      return lesson;
    }
  }

  // AppUser Builder
  public class AppUserBuilder {
    private String keycloakId = UUID.randomUUID().toString();
    private String email = "user-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
    private String displayName = "Test User";
    private boolean isPlatformAdmin = false;

    public AppUserBuilder withKeycloakId(String keycloakId) {
      this.keycloakId = keycloakId;
      return this;
    }

    public AppUserBuilder withEmail(String email) {
      this.email = email;
      return this;
    }

    public AppUserBuilder withDisplayName(String displayName) {
      this.displayName = displayName;
      return this;
    }

    public AppUserBuilder isPlatformAdmin(boolean isPlatformAdmin) {
      this.isPlatformAdmin = isPlatformAdmin;
      return this;
    }

    public AppUser build() {
      AppUser user = new AppUser(keycloakId, email, displayName);
      user.setPlatformAdmin(isPlatformAdmin);
      return user;
    }

    public AppUser persist() {
      AppUser user = build();
      entityManager.persist(user);
      return user;
    }
  }

  // SchoolMembership Builder
  public class SchoolMembershipBuilder {
    private final School school;
    private final AppUser user;
    private SchoolRole role = SchoolRole.VIEWER;
    private AppUser grantedBy;
    private Teacher linkedTeacher;
    private boolean isActive = true;

    public SchoolMembershipBuilder(School school, AppUser user) {
      this.school = school;
      this.user = user;
    }

    public SchoolMembershipBuilder withRole(SchoolRole role) {
      this.role = role;
      return this;
    }

    public SchoolMembershipBuilder grantedBy(AppUser grantedBy) {
      this.grantedBy = grantedBy;
      return this;
    }

    public SchoolMembershipBuilder linkedTo(Teacher teacher) {
      this.linkedTeacher = teacher;
      return this;
    }

    public SchoolMembershipBuilder isActive(boolean isActive) {
      this.isActive = isActive;
      return this;
    }

    public SchoolMembership build() {
      SchoolMembership membership = new SchoolMembership(user, school, role, grantedBy);
      membership.setLinkedTeacher(linkedTeacher);
      membership.setActive(isActive);
      return membership;
    }

    public SchoolMembership persist() {
      SchoolMembership membership = build();
      entityManager.persist(membership);
      return membership;
    }
  }
}
