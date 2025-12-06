package com.klassenzeit.klassenzeit.accessrequest;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * A request from a user to join a school with a specific role.
 *
 * <p>Users can request access to schools, and school admins can approve or reject these requests.
 */
@Entity
@Table(name = "school_access_request")
public class SchoolAccessRequest extends BaseEntity {

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "school_id", nullable = false)
  private School school;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "requested_role", nullable = false)
  private SchoolRole requestedRole = SchoolRole.VIEWER;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "status", nullable = false)
  private AccessRequestStatus status = AccessRequestStatus.PENDING;

  @Column(name = "message")
  private String message;

  @Column(name = "response_message")
  private String responseMessage;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "reviewed_by")
  private AppUser reviewedBy;

  @Column(name = "reviewed_at")
  private Instant reviewedAt;

  protected SchoolAccessRequest() {}

  public SchoolAccessRequest(
      AppUser user, School school, SchoolRole requestedRole, String message) {
    this.user = user;
    this.school = school;
    this.requestedRole = requestedRole != null ? requestedRole : SchoolRole.VIEWER;
    this.message = message;
    this.status = AccessRequestStatus.PENDING;
  }

  public AppUser getUser() {
    return user;
  }

  public School getSchool() {
    return school;
  }

  public SchoolRole getRequestedRole() {
    return requestedRole;
  }

  public AccessRequestStatus getStatus() {
    return status;
  }

  public void setStatus(AccessRequestStatus status) {
    this.status = status;
  }

  public String getMessage() {
    return message;
  }

  public String getResponseMessage() {
    return responseMessage;
  }

  public void setResponseMessage(String responseMessage) {
    this.responseMessage = responseMessage;
  }

  public AppUser getReviewedBy() {
    return reviewedBy;
  }

  public void setReviewedBy(AppUser reviewedBy) {
    this.reviewedBy = reviewedBy;
  }

  public Instant getReviewedAt() {
    return reviewedAt;
  }

  public void setReviewedAt(Instant reviewedAt) {
    this.reviewedAt = reviewedAt;
  }

  /** Mark this request as approved by the given reviewer. */
  public void approve(AppUser reviewer, String responseMessage) {
    this.status = AccessRequestStatus.APPROVED;
    this.reviewedBy = reviewer;
    this.reviewedAt = Instant.now();
    this.responseMessage = responseMessage;
  }

  /** Mark this request as rejected by the given reviewer. */
  public void reject(AppUser reviewer, String responseMessage) {
    this.status = AccessRequestStatus.REJECTED;
    this.reviewedBy = reviewer;
    this.reviewedAt = Instant.now();
    this.responseMessage = responseMessage;
  }

  /** Cancel this request (by the requester). */
  public void cancel() {
    this.status = AccessRequestStatus.CANCELLED;
  }
}
