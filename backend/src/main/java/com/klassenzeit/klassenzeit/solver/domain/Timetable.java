package com.klassenzeit.klassenzeit.solver.domain;

import ai.timefold.solver.core.api.domain.solution.PlanningEntityCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningScore;
import ai.timefold.solver.core.api.domain.solution.PlanningSolution;
import ai.timefold.solver.core.api.domain.solution.ProblemFactCollectionProperty;
import ai.timefold.solver.core.api.domain.valuerange.ValueRangeProvider;
import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import java.util.List;
import java.util.UUID;

/** Planning solution containing all input/output data. */
@PlanningSolution
public class Timetable {

  // Context - which term this timetable is for
  private UUID termId;

  // Problem facts - immutable during solving
  @ProblemFactCollectionProperty @ValueRangeProvider private List<PlanningTimeSlot> timeSlots;

  @ProblemFactCollectionProperty @ValueRangeProvider private List<PlanningRoom> rooms;

  @ProblemFactCollectionProperty private List<PlanningTeacher> teachers;

  @ProblemFactCollectionProperty private List<PlanningSchoolClass> schoolClasses;

  @ProblemFactCollectionProperty private List<PlanningSubject> subjects;

  // Planning entities - modified during solving
  @PlanningEntityCollectionProperty private List<PlanningLesson> lessons;

  // Score - calculated by constraint provider
  @PlanningScore private HardSoftScore score;

  /** No-arg constructor required by Timefold. */
  public Timetable() {}

  public Timetable(
      UUID termId,
      List<PlanningTimeSlot> timeSlots,
      List<PlanningRoom> rooms,
      List<PlanningTeacher> teachers,
      List<PlanningSchoolClass> schoolClasses,
      List<PlanningSubject> subjects,
      List<PlanningLesson> lessons) {
    this.termId = termId;
    this.timeSlots = timeSlots;
    this.rooms = rooms;
    this.teachers = teachers;
    this.schoolClasses = schoolClasses;
    this.subjects = subjects;
    this.lessons = lessons;
  }

  public UUID getTermId() {
    return termId;
  }

  public void setTermId(UUID termId) {
    this.termId = termId;
  }

  public List<PlanningTimeSlot> getTimeSlots() {
    return timeSlots;
  }

  public void setTimeSlots(List<PlanningTimeSlot> timeSlots) {
    this.timeSlots = timeSlots;
  }

  public List<PlanningRoom> getRooms() {
    return rooms;
  }

  public void setRooms(List<PlanningRoom> rooms) {
    this.rooms = rooms;
  }

  public List<PlanningTeacher> getTeachers() {
    return teachers;
  }

  public void setTeachers(List<PlanningTeacher> teachers) {
    this.teachers = teachers;
  }

  public List<PlanningSchoolClass> getSchoolClasses() {
    return schoolClasses;
  }

  public void setSchoolClasses(List<PlanningSchoolClass> schoolClasses) {
    this.schoolClasses = schoolClasses;
  }

  public List<PlanningSubject> getSubjects() {
    return subjects;
  }

  public void setSubjects(List<PlanningSubject> subjects) {
    this.subjects = subjects;
  }

  public List<PlanningLesson> getLessons() {
    return lessons;
  }

  public void setLessons(List<PlanningLesson> lessons) {
    this.lessons = lessons;
  }

  public HardSoftScore getScore() {
    return score;
  }

  public void setScore(HardSoftScore score) {
    this.score = score;
  }
}
