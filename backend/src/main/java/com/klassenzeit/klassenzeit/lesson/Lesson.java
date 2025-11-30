package com.klassenzeit.klassenzeit.lesson;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.common.WeekPattern;
import com.klassenzeit.klassenzeit.room.Room;
import com.klassenzeit.klassenzeit.school.Term;
import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.subject.Subject;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.timeslot.TimeSlot;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Lesson entity - the actual scheduled timetable entry. */
@Entity
@Table(name = "lesson")
public class Lesson extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "term_id", nullable = false)
  private Term term;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "school_class_id", nullable = false)
  private SchoolClass schoolClass;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "teacher_id", nullable = false)
  private Teacher teacher;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "subject_id", nullable = false)
  private Subject subject;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "room_id")
  private Room room;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "timeslot_id", nullable = false)
  private TimeSlot timeslot;

  @Enumerated(EnumType.STRING)
  @Column(name = "week_pattern", nullable = false)
  private WeekPattern weekPattern = WeekPattern.EVERY;

  public Lesson() {}

  public Term getTerm() {
    return term;
  }

  public void setTerm(Term term) {
    this.term = term;
  }

  public SchoolClass getSchoolClass() {
    return schoolClass;
  }

  public void setSchoolClass(SchoolClass schoolClass) {
    this.schoolClass = schoolClass;
  }

  public Teacher getTeacher() {
    return teacher;
  }

  public void setTeacher(Teacher teacher) {
    this.teacher = teacher;
  }

  public Subject getSubject() {
    return subject;
  }

  public void setSubject(Subject subject) {
    this.subject = subject;
  }

  public Room getRoom() {
    return room;
  }

  public void setRoom(Room room) {
    this.room = room;
  }

  public TimeSlot getTimeslot() {
    return timeslot;
  }

  public void setTimeslot(TimeSlot timeslot) {
    this.timeslot = timeslot;
  }

  public WeekPattern getWeekPattern() {
    return weekPattern;
  }

  public void setWeekPattern(WeekPattern weekPattern) {
    this.weekPattern = weekPattern;
  }
}
