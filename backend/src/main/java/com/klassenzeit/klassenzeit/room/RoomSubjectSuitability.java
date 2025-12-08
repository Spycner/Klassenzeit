package com.klassenzeit.klassenzeit.room;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.subject.Subject;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Tracks which subjects are suitable to be taught in which rooms. */
@Entity
@Table(name = "room_subject_suitability")
public class RoomSubjectSuitability extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "room_id", nullable = false)
  private Room room;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "subject_id", nullable = false)
  private Subject subject;

  @Column(name = "is_required", nullable = false)
  private Boolean isRequired = false;

  @Column(length = 255)
  private String notes;

  public RoomSubjectSuitability() {}

  public Room getRoom() {
    return room;
  }

  public void setRoom(Room room) {
    this.room = room;
  }

  public Subject getSubject() {
    return subject;
  }

  public void setSubject(Subject subject) {
    this.subject = subject;
  }

  public Boolean isRequired() {
    return isRequired;
  }

  public void setIsRequired(Boolean isRequired) {
    this.isRequired = isRequired;
  }

  public String getNotes() {
    return notes;
  }

  public void setNotes(String notes) {
    this.notes = notes;
  }
}
