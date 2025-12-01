package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.school.School;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;

/** Teacher entity. */
@Entity
@Table(name = "teacher")
public class Teacher extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "school_id", nullable = false)
  private School school;

  @Column(name = "first_name", nullable = false, length = 100)
  private String firstName;

  @Column(name = "last_name", nullable = false, length = 100)
  private String lastName;

  @Column(length = 255)
  private String email;

  @Column(nullable = false, length = 5)
  private String abbreviation;

  @Column(name = "max_hours_per_week", nullable = false)
  private Integer maxHoursPerWeek = 28;

  @Column(name = "is_part_time", nullable = false)
  private Boolean isPartTime = false;

  @Column(name = "is_active", nullable = false)
  private Boolean isActive = true;

  @OneToMany(mappedBy = "teacher", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<TeacherSubjectQualification> qualifications = new ArrayList<>();

  @OneToMany(mappedBy = "teacher", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<TeacherAvailability> availabilities = new ArrayList<>();

  public Teacher() {}

  public School getSchool() {
    return school;
  }

  public void setSchool(School school) {
    this.school = school;
  }

  public String getFirstName() {
    return firstName;
  }

  public void setFirstName(String firstName) {
    this.firstName = firstName;
  }

  public String getLastName() {
    return lastName;
  }

  public void setLastName(String lastName) {
    this.lastName = lastName;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getAbbreviation() {
    return abbreviation;
  }

  public void setAbbreviation(String abbreviation) {
    this.abbreviation = abbreviation;
  }

  public Integer getMaxHoursPerWeek() {
    return maxHoursPerWeek;
  }

  public void setMaxHoursPerWeek(Integer maxHoursPerWeek) {
    this.maxHoursPerWeek = maxHoursPerWeek;
  }

  public Boolean isPartTime() {
    return isPartTime;
  }

  public void setPartTime(Boolean partTime) {
    isPartTime = partTime;
  }

  public Boolean isActive() {
    return isActive;
  }

  public void setActive(Boolean active) {
    isActive = active;
  }

  public List<TeacherSubjectQualification> getQualifications() {
    return qualifications;
  }

  public void setQualifications(List<TeacherSubjectQualification> qualifications) {
    this.qualifications = qualifications;
  }

  public List<TeacherAvailability> getAvailabilities() {
    return availabilities;
  }

  public void setAvailabilities(List<TeacherAvailability> availabilities) {
    this.availabilities = availabilities;
  }

  /** Returns the full name of the teacher. */
  public String getFullName() {
    return firstName + " " + lastName;
  }
}
