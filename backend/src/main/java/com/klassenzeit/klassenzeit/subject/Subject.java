package com.klassenzeit.klassenzeit.subject;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.school.School;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Subject entity (e.g., Mathematics, German). */
@Entity
@Table(name = "subject")
public class Subject extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "school_id", nullable = false)
  private School school;

  @Column(nullable = false, length = 100)
  private String name;

  @Column(nullable = false, length = 10)
  private String abbreviation;

  @Column(length = 7)
  private String color;

  @Column(name = "needs_special_room", nullable = false)
  private Boolean needsSpecialRoom = false;

  public Subject() {}

  public School getSchool() {
    return school;
  }

  public void setSchool(School school) {
    this.school = school;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getAbbreviation() {
    return abbreviation;
  }

  public void setAbbreviation(String abbreviation) {
    this.abbreviation = abbreviation;
  }

  public String getColor() {
    return color;
  }

  public void setColor(String color) {
    this.color = color;
  }

  public Boolean isNeedsSpecialRoom() {
    return needsSpecialRoom;
  }

  public void setNeedsSpecialRoom(Boolean needsSpecialRoom) {
    this.needsSpecialRoom = needsSpecialRoom;
  }
}
