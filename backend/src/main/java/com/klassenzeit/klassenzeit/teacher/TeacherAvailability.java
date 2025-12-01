package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.common.AvailabilityType;
import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.school.Term;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Tracks when teachers are available, blocked, or prefer to teach. */
@Entity
@Table(name = "teacher_availability")
public class TeacherAvailability extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "teacher_id", nullable = false)
  private Teacher teacher;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "term_id")
  private Term term;

  @Column(name = "day_of_week", nullable = false)
  private Short dayOfWeek;

  @Column(nullable = false)
  private Short period;

  @Enumerated(EnumType.STRING)
  @Column(name = "availability_type", nullable = false)
  private AvailabilityType availabilityType;

  @Column(length = 255)
  private String reason;

  public TeacherAvailability() {}

  public Teacher getTeacher() {
    return teacher;
  }

  public void setTeacher(Teacher teacher) {
    this.teacher = teacher;
  }

  public Term getTerm() {
    return term;
  }

  public void setTerm(Term term) {
    this.term = term;
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

  public AvailabilityType getAvailabilityType() {
    return availabilityType;
  }

  public void setAvailabilityType(AvailabilityType availabilityType) {
    this.availabilityType = availabilityType;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

  /** Returns true if this availability applies to all terms. */
  public boolean isGlobal() {
    return term == null;
  }
}
