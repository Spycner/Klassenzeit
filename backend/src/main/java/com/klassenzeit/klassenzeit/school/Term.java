package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;

/** A period within a school year (semester, quarter, etc.). */
@Entity
@Table(name = "term")
public class Term extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "school_year_id", nullable = false)
  private SchoolYear schoolYear;

  @Column(nullable = false, length = 100)
  private String name;

  @Column(name = "start_date", nullable = false)
  private LocalDate startDate;

  @Column(name = "end_date", nullable = false)
  private LocalDate endDate;

  @Column(name = "is_current", nullable = false)
  private Boolean isCurrent = false;

  public Term() {}

  public SchoolYear getSchoolYear() {
    return schoolYear;
  }

  public void setSchoolYear(SchoolYear schoolYear) {
    this.schoolYear = schoolYear;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public void setStartDate(LocalDate startDate) {
    this.startDate = startDate;
  }

  public LocalDate getEndDate() {
    return endDate;
  }

  public void setEndDate(LocalDate endDate) {
    this.endDate = endDate;
  }

  public Boolean isCurrent() {
    return isCurrent;
  }

  public void setCurrent(Boolean current) {
    isCurrent = current;
  }
}
