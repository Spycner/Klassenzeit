# B-107: Actuator & Health Checks

## Description
Add Spring Boot Actuator for production readiness.

## Completion Notes

### Dependencies Added
```kotlin
implementation("org.springframework.boot:spring-boot-starter-actuator")
```

### Configuration
In `application.yaml`:
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health
  endpoint:
    health:
      show-details: never
```

### Endpoints
- `/actuator/health` - Application and dependency health (DB, disk)

### Notes
Required for CI to detect when backend is ready during E2E tests.
