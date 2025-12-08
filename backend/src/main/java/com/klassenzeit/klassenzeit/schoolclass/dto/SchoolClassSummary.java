package com.klassenzeit.klassenzeit.schoolclass.dto;

import com.klassenzeit.klassenzeit.schoolclass.SchoolClass;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import java.util.UUID;

/** Summary DTO for a school class (for list responses). */
public record SchoolClassSummary(
    UUID id,
    String name,
    Short gradeLevel,
    Integer studentCount,
    String classTeacherName,
    Boolean isActive) {

  /** Creates a SchoolClassSummary from a SchoolClass entity. */
  public static SchoolClassSummary fromEntity(SchoolClass c) {
    Teacher classTeacher = c.getClassTeacher();
    return new SchoolClassSummary(
        c.getId(),
        c.getName(),
        c.getGradeLevel(),
        c.getStudentCount(),
        classTeacher != null ? classTeacher.getFullName() : null,
        c.isActive());
  }
}
