package com.klassenzeit.klassenzeit.solver.domain;

import java.util.Objects;
import java.util.UUID;

/** Problem fact representing a subject. Immutable during solving. */
public class PlanningSubject {

  private UUID id;
  private String name;
  private String abbreviation;

  /** No-arg constructor for Timefold. */
  public PlanningSubject() {}

  public PlanningSubject(UUID id, String name, String abbreviation) {
    this.id = id;
    this.name = name;
    this.abbreviation = abbreviation;
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getAbbreviation() {
    return abbreviation;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    PlanningSubject that = (PlanningSubject) o;
    return Objects.equals(id, that.id);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id);
  }

  @Override
  public String toString() {
    return abbreviation;
  }
}
