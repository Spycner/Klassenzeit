package com.klassenzeit.klassenzeit.solver.domain;

import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Problem fact representing a teacher with availability constraints. Denormalizes availability data
 * for efficient constraint evaluation.
 */
public class PlanningTeacher {

  private UUID id;
  private String fullName;
  private String abbreviation;
  private int maxHoursPerWeek;

  // Denormalized availability - keys are "dayOfWeek-period" format
  private Set<String> blockedSlots; // Hard constraint: cannot teach here
  private Set<String> preferredSlots; // Soft constraint: prefers to teach here

  // Denormalized qualifications - subjectId -> set of grades teacher can teach
  private Map<UUID, Set<Integer>> qualifiedSubjectGrades;

  /** No-arg constructor for Timefold. */
  public PlanningTeacher() {}

  public PlanningTeacher(
      UUID id,
      String fullName,
      String abbreviation,
      int maxHoursPerWeek,
      Set<String> blockedSlots,
      Set<String> preferredSlots,
      Map<UUID, Set<Integer>> qualifiedSubjectGrades) {
    this.id = id;
    this.fullName = fullName;
    this.abbreviation = abbreviation;
    this.maxHoursPerWeek = maxHoursPerWeek;
    this.blockedSlots = blockedSlots != null ? blockedSlots : Set.of();
    this.preferredSlots = preferredSlots != null ? preferredSlots : Set.of();
    this.qualifiedSubjectGrades =
        qualifiedSubjectGrades != null ? qualifiedSubjectGrades : Map.of();
  }

  public UUID getId() {
    return id;
  }

  public String getFullName() {
    return fullName;
  }

  public String getAbbreviation() {
    return abbreviation;
  }

  public int getMaxHoursPerWeek() {
    return maxHoursPerWeek;
  }

  public Set<String> getBlockedSlots() {
    return blockedSlots;
  }

  public Set<String> getPreferredSlots() {
    return preferredSlots;
  }

  public Map<UUID, Set<Integer>> getQualifiedSubjectGrades() {
    return qualifiedSubjectGrades;
  }

  /** Checks if teacher is blocked at the given time slot. */
  public boolean isBlockedAt(PlanningTimeSlot timeSlot) {
    return timeSlot != null && blockedSlots.contains(timeSlot.getDayPeriodKey());
  }

  /** Checks if teacher prefers the given time slot. */
  public boolean prefersSlot(PlanningTimeSlot timeSlot) {
    return timeSlot != null && preferredSlots.contains(timeSlot.getDayPeriodKey());
  }

  /** Checks if teacher is qualified to teach subject at grade level. */
  public boolean isQualifiedFor(UUID subjectId, short gradeLevel) {
    Set<Integer> grades = qualifiedSubjectGrades.get(subjectId);
    return grades != null && grades.contains((int) gradeLevel);
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    PlanningTeacher that = (PlanningTeacher) o;
    return Objects.equals(id, that.id);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id);
  }

  @Override
  public String toString() {
    return abbreviation;
  }
}
