package com.klassenzeit.klassenzeit.teacher;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.common.QualificationLevel;
import com.klassenzeit.klassenzeit.subject.Subject;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Tracks which subjects a teacher can teach and at what qualification level. */
@Entity
@Table(name = "teacher_subject_qualification")
public class TeacherSubjectQualification extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "teacher_id", nullable = false)
  private Teacher teacher;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "subject_id", nullable = false)
  private Subject subject;

  @Enumerated(EnumType.STRING)
  @Column(name = "qualification_level", nullable = false)
  private QualificationLevel qualificationLevel;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "can_teach_grades", columnDefinition = "integer[]")
  private List<Integer> canTeachGrades;

  @Column(name = "max_hours_per_week")
  private Integer maxHoursPerWeek;

  public TeacherSubjectQualification() {}

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

  public QualificationLevel getQualificationLevel() {
    return qualificationLevel;
  }

  public void setQualificationLevel(QualificationLevel qualificationLevel) {
    this.qualificationLevel = qualificationLevel;
  }

  public List<Integer> getCanTeachGrades() {
    return canTeachGrades;
  }

  public void setCanTeachGrades(List<Integer> canTeachGrades) {
    this.canTeachGrades = canTeachGrades;
  }

  public Integer getMaxHoursPerWeek() {
    return maxHoursPerWeek;
  }

  public void setMaxHoursPerWeek(Integer maxHoursPerWeek) {
    this.maxHoursPerWeek = maxHoursPerWeek;
  }
}
