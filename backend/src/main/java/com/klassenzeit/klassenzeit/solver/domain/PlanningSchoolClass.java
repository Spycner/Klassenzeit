package com.klassenzeit.klassenzeit.solver.domain;

import java.util.Objects;
import java.util.UUID;

/** Problem fact representing a school class. */
public class PlanningSchoolClass {

  private UUID id;
  private String name;
  private short gradeLevel;
  private Integer studentCount;
  private UUID classTeacherId; // Reference to class teacher for soft constraint

  /** No-arg constructor for Timefold. */
  public PlanningSchoolClass() {}

  public PlanningSchoolClass(
      UUID id, String name, short gradeLevel, Integer studentCount, UUID classTeacherId) {
    this.id = id;
    this.name = name;
    this.gradeLevel = gradeLevel;
    this.studentCount = studentCount;
    this.classTeacherId = classTeacherId;
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public short getGradeLevel() {
    return gradeLevel;
  }

  public Integer getStudentCount() {
    return studentCount;
  }

  public UUID getClassTeacherId() {
    return classTeacherId;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    PlanningSchoolClass that = (PlanningSchoolClass) o;
    return Objects.equals(id, that.id);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id);
  }

  @Override
  public String toString() {
    return name;
  }
}
