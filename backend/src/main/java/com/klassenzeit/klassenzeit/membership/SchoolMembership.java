package com.klassenzeit.klassenzeit.membership;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * User membership in a school with a specific role.
 *
 * <p>A user can belong to multiple schools with different roles in each.
 */
@Entity
@Table(
    name = "school_membership",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "school_id"}))
public class SchoolMembership extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "school_id", nullable = false)
  private School school;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "role", nullable = false)
  private SchoolRole role;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "linked_teacher_id")
  private Teacher linkedTeacher;

  @Column(name = "is_active", nullable = false)
  private boolean active = true;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "granted_by")
  private AppUser grantedBy;

  @Column(name = "granted_at", nullable = false)
  private Instant grantedAt;

  protected SchoolMembership() {}

  public SchoolMembership(AppUser user, School school, SchoolRole role, AppUser grantedBy) {
    this.user = user;
    this.school = school;
    this.role = role;
    this.grantedBy = grantedBy;
    this.grantedAt = Instant.now();
  }

  public AppUser getUser() {
    return user;
  }

  public School getSchool() {
    return school;
  }

  public SchoolRole getRole() {
    return role;
  }

  public void setRole(SchoolRole role) {
    this.role = role;
  }

  public Teacher getLinkedTeacher() {
    return linkedTeacher;
  }

  public void setLinkedTeacher(Teacher linkedTeacher) {
    this.linkedTeacher = linkedTeacher;
  }

  public boolean isActive() {
    return active;
  }

  public void setActive(boolean active) {
    this.active = active;
  }

  public AppUser getGrantedBy() {
    return grantedBy;
  }

  public Instant getGrantedAt() {
    return grantedAt;
  }
}
