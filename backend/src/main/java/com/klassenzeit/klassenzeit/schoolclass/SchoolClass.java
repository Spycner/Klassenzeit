package com.klassenzeit.klassenzeit.schoolclass;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** School class entity (e.g., "3a", "5b"). Named SchoolClass to avoid Java keyword conflict. */
@Entity
@Table(name = "school_class")
public class SchoolClass extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "school_id", nullable = false)
  private School school;

  @Column(nullable = false, length = 20)
  private String name;

  @Column(name = "grade_level", nullable = false)
  private Short gradeLevel;

  @Column(name = "student_count")
  private Integer studentCount;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "class_teacher_id")
  private Teacher classTeacher;

  @Column(name = "is_active", nullable = false)
  private Boolean isActive = true;

  public SchoolClass() {}

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

  public Short getGradeLevel() {
    return gradeLevel;
  }

  public void setGradeLevel(Short gradeLevel) {
    this.gradeLevel = gradeLevel;
  }

  public Integer getStudentCount() {
    return studentCount;
  }

  public void setStudentCount(Integer studentCount) {
    this.studentCount = studentCount;
  }

  public Teacher getClassTeacher() {
    return classTeacher;
  }

  public void setClassTeacher(Teacher classTeacher) {
    this.classTeacher = classTeacher;
  }

  public Boolean isActive() {
    return isActive;
  }

  public void setActive(Boolean active) {
    isActive = active;
  }
}
