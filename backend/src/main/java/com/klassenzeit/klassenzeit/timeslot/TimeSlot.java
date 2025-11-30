package com.klassenzeit.klassenzeit.timeslot;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.school.School;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalTime;

/** Defines a time slot in the weekly schedule grid. */
@Entity
@Table(name = "time_slot")
public class TimeSlot extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "school_id", nullable = false)
  private School school;

  @Column(name = "day_of_week", nullable = false)
  private Short dayOfWeek;

  @Column(nullable = false)
  private Short period;

  @Column(name = "start_time", nullable = false)
  private LocalTime startTime;

  @Column(name = "end_time", nullable = false)
  private LocalTime endTime;

  @Column(name = "is_break", nullable = false)
  private Boolean isBreak = false;

  @Column(length = 50)
  private String label;

  public TimeSlot() {}

  public School getSchool() {
    return school;
  }

  public void setSchool(School school) {
    this.school = school;
  }

  public Short getDayOfWeek() {
    return dayOfWeek;
  }

  public void setDayOfWeek(Short dayOfWeek) {
    this.dayOfWeek = dayOfWeek;
  }

  public Short getPeriod() {
    return period;
  }

  public void setPeriod(Short period) {
    this.period = period;
  }

  public LocalTime getStartTime() {
    return startTime;
  }

  public void setStartTime(LocalTime startTime) {
    this.startTime = startTime;
  }

  public LocalTime getEndTime() {
    return endTime;
  }

  public void setEndTime(LocalTime endTime) {
    this.endTime = endTime;
  }

  public Boolean isBreak() {
    return isBreak;
  }

  public void setBreak(Boolean isBreak) {
    this.isBreak = isBreak;
  }

  public String getLabel() {
    return label;
  }

  public void setLabel(String label) {
    this.label = label;
  }

  /** Returns the day name (Monday-Friday). */
  public String getDayName() {
    return switch (dayOfWeek) {
      case 0 -> "Monday";
      case 1 -> "Tuesday";
      case 2 -> "Wednesday";
      case 3 -> "Thursday";
      case 4 -> "Friday";
      default -> "Unknown";
    };
  }
}
