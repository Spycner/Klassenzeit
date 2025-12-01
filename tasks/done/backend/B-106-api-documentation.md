# B-106: API Documentation

## Description
Add SpringDoc for automatic OpenAPI generation.

## Completion Notes

### Dependencies Added
```kotlin
implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.9")
```

### Configuration
In `application.yaml`:
- API title, description, version
- Swagger UI sorting options

### Access Points
- Swagger UI: `/swagger-ui.html`
- OpenAPI spec: `/v3/api-docs`
