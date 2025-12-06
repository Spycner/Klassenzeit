package com.klassenzeit.klassenzeit.common;

import java.util.UUID;

/** Exception thrown when an entity is not found. */
public class EntityNotFoundException extends RuntimeException {

  private final String entityType;
  private final UUID entityId;
  private final String identifier;

  public EntityNotFoundException(String entityType, UUID entityId) {
    super(entityType + " not found with id: " + entityId);
    this.entityType = entityType;
    this.entityId = entityId;
    this.identifier = null;
  }

  public EntityNotFoundException(String entityType, String identifier) {
    super(entityType + " not found with identifier: " + identifier);
    this.entityType = entityType;
    this.entityId = null;
    this.identifier = identifier;
  }

  public String getEntityType() {
    return entityType;
  }

  public UUID getEntityId() {
    return entityId;
  }

  public String getIdentifier() {
    return identifier;
  }
}
