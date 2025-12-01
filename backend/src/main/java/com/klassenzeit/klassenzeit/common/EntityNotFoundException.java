package com.klassenzeit.klassenzeit.common;

import java.util.UUID;

/** Exception thrown when an entity is not found. */
public class EntityNotFoundException extends RuntimeException {

  private final String entityType;
  private final UUID entityId;

  public EntityNotFoundException(String entityType, UUID entityId) {
    super(entityType + " not found with id: " + entityId);
    this.entityType = entityType;
    this.entityId = entityId;
  }

  public String getEntityType() {
    return entityType;
  }

  public UUID getEntityId() {
    return entityId;
  }
}
