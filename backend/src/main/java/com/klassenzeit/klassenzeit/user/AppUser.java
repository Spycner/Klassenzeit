package com.klassenzeit.klassenzeit.user;

import com.klassenzeit.klassenzeit.common.BaseEntity;
import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Application user linked to Keycloak identity.
 *
 * <p>Keycloak handles identity (login, passwords), this entity handles application-specific data
 * and authorization (school memberships).
 */
@Entity
@Table(name = "app_user")
public class AppUser extends BaseEntity {

  @Column(name = "keycloak_id", nullable = false, unique = true)
  private String keycloakId;

  @Column(name = "email", nullable = false, unique = true)
  private String email;

  @Column(name = "display_name", nullable = false)
  private String displayName;

  @Column(name = "is_platform_admin", nullable = false)
  private boolean platformAdmin = false;

  @Column(name = "is_active", nullable = false)
  private boolean active = true;

  @Column(name = "last_login_at")
  private Instant lastLoginAt;

  @OneToMany(mappedBy = "user")
  private List<SchoolMembership> memberships = new ArrayList<>();

  protected AppUser() {}

  public AppUser(String keycloakId, String email, String displayName) {
    this.keycloakId = keycloakId;
    this.email = email;
    this.displayName = displayName;
  }

  public String getKeycloakId() {
    return keycloakId;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public boolean isPlatformAdmin() {
    return platformAdmin;
  }

  public void setPlatformAdmin(boolean platformAdmin) {
    this.platformAdmin = platformAdmin;
  }

  public boolean isActive() {
    return active;
  }

  public void setActive(boolean active) {
    this.active = active;
  }

  public Instant getLastLoginAt() {
    return lastLoginAt;
  }

  public void setLastLoginAt(Instant lastLoginAt) {
    this.lastLoginAt = lastLoginAt;
  }

  public List<SchoolMembership> getMemberships() {
    return memberships;
  }
}
