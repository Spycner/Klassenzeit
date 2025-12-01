package com.klassenzeit.klassenzeit.solver.domain;

import ai.timefold.solver.core.api.domain.entity.PlanningEntity;
import ai.timefold.solver.core.api.domain.lookup.PlanningId;
import ai.timefold.solver.core.api.domain.variable.PlanningVariable;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import java.util.Objects;
import java.util.UUID;

/**
 * Planning entity - the solver assigns timeSlot and room. Teacher, subject, and schoolClass are
 * fixed (problem properties).
 */
@PlanningEntity
public class PlanningLesson {

  @PlanningId private UUID id;

  // Fixed during solving (problem properties)
  private PlanningSchoolClass schoolClass;
  private PlanningTeacher teacher;
  private PlanningSubject subject;
  private WeekPattern weekPattern;

  // Planning variables (assigned by solver)
  @PlanningVariable private PlanningTimeSlot timeSlot;

  @PlanningVariable private PlanningRoom room;

  /** No-arg constructor required by Timefold. */
  public PlanningLesson() {}

  /** Constructor for creating a lesson without assignments (for solver to fill). */
  public PlanningLesson(
      UUID id,
      PlanningSchoolClass schoolClass,
      PlanningTeacher teacher,
      PlanningSubject subject,
      WeekPattern weekPattern) {
    this.id = id;
    this.schoolClass = schoolClass;
    this.teacher = teacher;
    this.subject = subject;
    this.weekPattern = weekPattern;
  }

  /** Full constructor (for applying existing solution). */
  public PlanningLesson(
      UUID id,
      PlanningSchoolClass schoolClass,
      PlanningTeacher teacher,
      PlanningSubject subject,
      WeekPattern weekPattern,
      PlanningTimeSlot timeSlot,
      PlanningRoom room) {
    this(id, schoolClass, teacher, subject, weekPattern);
    this.timeSlot = timeSlot;
    this.room = room;
  }

  public UUID getId() {
    return id;
  }

  public PlanningSchoolClass getSchoolClass() {
    return schoolClass;
  }

  public PlanningTeacher getTeacher() {
    return teacher;
  }

  public PlanningSubject getSubject() {
    return subject;
  }

  public WeekPattern getWeekPattern() {
    return weekPattern;
  }

  public PlanningTimeSlot getTimeSlot() {
    return timeSlot;
  }

  public void setTimeSlot(PlanningTimeSlot timeSlot) {
    this.timeSlot = timeSlot;
  }

  public PlanningRoom getRoom() {
    return room;
  }

  public void setRoom(PlanningRoom room) {
    this.room = room;
  }

  /**
   * Checks if two lessons have overlapping week patterns. EVERY conflicts with everything; A only
   * with A/EVERY; B only with B/EVERY.
   */
  public boolean weekPatternsOverlap(PlanningLesson other) {
    if (this.weekPattern == WeekPattern.EVERY || other.weekPattern == WeekPattern.EVERY) {
      return true;
    }
    return this.weekPattern == other.weekPattern;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    PlanningLesson that = (PlanningLesson) o;
    return Objects.equals(id, that.id);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id);
  }

  @Override
  public String toString() {
    return subject
        + "@"
        + schoolClass
        + (timeSlot != null ? " " + timeSlot : "")
        + (room != null ? " " + room : "");
  }
}
