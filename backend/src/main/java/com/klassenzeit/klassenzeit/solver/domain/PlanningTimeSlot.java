package com.klassenzeit.klassenzeit.solver.domain;

import java.time.LocalTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Problem fact representing a time slot in the weekly grid. Used as a @ValueRangeProvider for
 * PlanningLesson.timeSlot.
 */
public class PlanningTimeSlot {

  private UUID id;
  private short dayOfWeek; // 0-4 (Mon-Fri)
  private short period; // 1-10
  private LocalTime startTime;
  private LocalTime endTime;
  private boolean isBreak;

  /** No-arg constructor for Timefold. */
  public PlanningTimeSlot() {}

  public PlanningTimeSlot(
      UUID id,
      short dayOfWeek,
      short period,
      LocalTime startTime,
      LocalTime endTime,
      boolean isBreak) {
    this.id = id;
    this.dayOfWeek = dayOfWeek;
    this.period = period;
    this.startTime = startTime;
    this.endTime = endTime;
    this.isBreak = isBreak;
  }

  public UUID getId() {
    return id;
  }

  public short getDayOfWeek() {
    return dayOfWeek;
  }

  public short getPeriod() {
    return period;
  }

  public LocalTime getStartTime() {
    return startTime;
  }

  public LocalTime getEndTime() {
    return endTime;
  }

  public boolean isBreak() {
    return isBreak;
  }

  /**
   * Returns a unique key for day+period combination. Useful for constraint matching and teacher
   * availability lookups.
   */
  public String getDayPeriodKey() {
    return dayOfWeek + "-" + period;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    PlanningTimeSlot that = (PlanningTimeSlot) o;
    return Objects.equals(id, that.id);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id);
  }

  @Override
  public String toString() {
    String[] days = {"Mon", "Tue", "Wed", "Thu", "Fri"};
    String dayName = (dayOfWeek >= 0 && dayOfWeek < days.length) ? days[dayOfWeek] : "?";
    return dayName + "-P" + period;
  }
}
