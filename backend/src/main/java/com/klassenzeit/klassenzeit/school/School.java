package com.klassenzeit.klassenzeit.school;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** School entity - the root tenant for multi-tenancy. */
@Entity
@Table(name = "school")
public class School extends BaseEntity {

  @Column(nullable = false)
  private String name;

  @Column(nullable = false, unique = true, length = 100)
  private String slug;

  @Column(name = "school_type", nullable = false, length = 50)
  private String schoolType;

  @Column(name = "min_grade", nullable = false)
  private Short minGrade;

  @Column(name = "max_grade", nullable = false)
  private Short maxGrade;

  @Column(nullable = false, length = 50)
  private String timezone = "Europe/Berlin";

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private String settings = "{}";

  @OneToMany(mappedBy = "school", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<SchoolYear> schoolYears = new ArrayList<>();

  public School() {}

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getSlug() {
    return slug;
  }

  public void setSlug(String slug) {
    this.slug = slug;
  }

  public String getSchoolType() {
    return schoolType;
  }

  public void setSchoolType(String schoolType) {
    this.schoolType = schoolType;
  }

  public Short getMinGrade() {
    return minGrade;
  }

  public void setMinGrade(Short minGrade) {
    this.minGrade = minGrade;
  }

  public Short getMaxGrade() {
    return maxGrade;
  }

  public void setMaxGrade(Short maxGrade) {
    this.maxGrade = maxGrade;
  }

  public String getTimezone() {
    return timezone;
  }

  public void setTimezone(String timezone) {
    this.timezone = timezone;
  }

  public String getSettings() {
    return settings;
  }

  public void setSettings(String settings) {
    this.settings = settings;
  }

  public List<SchoolYear> getSchoolYears() {
    return schoolYears;
  }

  public void setSchoolYears(List<SchoolYear> schoolYears) {
    this.schoolYears = schoolYears;
  }
}
