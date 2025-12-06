package com.klassenzeit.klassenzeit.school;

import java.util.UUID;

/** Exception thrown when a school's slug has changed and the request should be redirected. */
public class SlugRedirectException extends RuntimeException {

  private final String newSlug;
  private final UUID schoolId;

  public SlugRedirectException(String newSlug, UUID schoolId) {
    super("Slug has been changed to: " + newSlug);
    this.newSlug = newSlug;
    this.schoolId = schoolId;
  }

  public String getNewSlug() {
    return newSlug;
  }

  public UUID getSchoolId() {
    return schoolId;
  }
}
