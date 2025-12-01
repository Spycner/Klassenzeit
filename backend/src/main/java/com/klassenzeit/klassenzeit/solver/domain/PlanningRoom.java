package com.klassenzeit.klassenzeit.solver.domain;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Problem fact representing a room. Used as a @ValueRangeProvider for PlanningLesson.room. */
public class PlanningRoom {

  private UUID id;
  private String name;
  private Integer capacity;
  private Set<String> features; // Denormalized from JSONB for performance

  /** No-arg constructor for Timefold. */
  public PlanningRoom() {}

  public PlanningRoom(UUID id, String name, Integer capacity, Set<String> features) {
    this.id = id;
    this.name = name;
    this.capacity = capacity;
    this.features = features != null ? features : Set.of();
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public Integer getCapacity() {
    return capacity;
  }

  public Set<String> getFeatures() {
    return features;
  }

  /** Checks if room has all required features. */
  public boolean hasFeatures(Set<String> required) {
    if (required == null || required.isEmpty()) {
      return true;
    }
    return features.containsAll(required);
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    PlanningRoom that = (PlanningRoom) o;
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
