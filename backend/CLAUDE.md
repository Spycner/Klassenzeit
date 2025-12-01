# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@../CLAUDE.md

## Project Overview

Klassenzeit is a timetabler application for schools. This is the backend component built with Spring Boot 3.5.8 and Java 21.

## Build Commands

```bash
# Build the project
./gradlew build

# Run the application
./gradlew bootRun

# Run all tests
./gradlew test

# Run a single test class
./gradlew test --tests "com.klassenzeit.klassenzeit.KlassenzeitApplicationTests"

# Run a single test method
./gradlew test --tests "com.klassenzeit.klassenzeit.KlassenzeitApplicationTests.contextLoads"

# Clean build
./gradlew clean build
```

## Code Quality

```bash
# Format code (auto-fix)
./gradlew spotlessApply

# Check formatting only
./gradlew spotlessCheck

# Run all quality checks (Spotless, Checkstyle, SpotBugs, PMD, tests) in background
./gradlew check > gradle-check.log 2>&1 &

# Check if gradle check is still running (check every 30-60 seconds, not more frequently)
pgrep -f "gradlew check" && echo "Still running..." || echo "Finished"

# View results after completion
cat gradle-check.log

# Run tests with coverage report
./gradlew test jacocoTestReport

# View coverage report
open build/reports/jacoco/test/html/index.html
```

Tools configured:
- **Spotless**: Code formatting (Google Java Format)
- **Checkstyle**: Style rules (Google style)
- **SpotBugs**: Bug detection
- **PMD**: Code smell detection
- **JaCoCo**: Coverage reports

**IMPORTANT**: Always run `./gradlew check` after adding or modifying code to ensure all quality checks pass before committing. Run it in the background (`> gradle-check.log 2>&1 &`) to avoid blocking the session. Wait at least 30 seconds before the first status check, then check every 30-60 seconds until complete. Do not poll more frequently to avoid wasting tokens.

## Architecture

- **Framework**: Spring Boot 3.5.8 with Gradle (Kotlin DSL)
- **Java Version**: 21
- **Base Package**: `com.klassenzeit.klassenzeit`
- **Entry Point**: `KlassenzeitApplication.java`
- **Configuration**: `src/main/resources/application.yaml`

### Package Structure (Package-by-Feature)

```
com.klassenzeit.klassenzeit/
  common/       # Shared base classes and enums (BaseEntity, QualificationLevel, etc.)
  school/       # School, SchoolYear, Term (multi-tenancy root)
  teacher/      # Teacher, TeacherSubjectQualification, TeacherAvailability
  subject/      # Subject definitions
  room/         # Room with capacity and features
  schoolclass/  # SchoolClass (student groups like "3a", "5b")
  timeslot/     # TimeSlot (weekly time grid)
  lesson/       # Lesson (scheduled timetable entries)
```

Each feature package contains: Entity, Repository, Service, Controller (when needed).

### API Documentation

OpenAPI docs available at `http://localhost:8080/v3/api-docs` (Swagger UI at `/swagger-ui.html`).

**When changing API endpoints or DTOs**: Run `npm run generate-api` in the frontend to regenerate TypeScript types.

### Data Model

See `docs/data-model.md` for the complete ER diagram.

**Core entities:**
- `School` - Multi-tenant root (supports multiple schools)
- `SchoolYear` / `Term` - Academic period hierarchy
- `Teacher` - With qualifications and availability tracking
- `Subject` - What's taught (Math, German, etc.)
- `Room` - With capacity and features (JSONB)
- `SchoolClass` - Student groups
- `TimeSlot` - Weekly schedule grid
- `Lesson` - The actual scheduled timetable entry

## Database

- **Database**: PostgreSQL 17
- **ORM**: Spring Data JPA
- **Migrations**: Flyway (SQL-first)
- **Migration Location**: `src/main/resources/db/migration/`

### Flyway Naming Convention
- `V{version}__{description}.sql` - Versioned migrations (e.g., `V1__create_tables.sql`)
- `R__{description}.sql` - Repeatable migrations (for views, functions)

### Schema Design
- Flyway owns the schema (write DDL manually)
- JPA entities map to the schema (`ddl-auto: validate`)

## Testing

### Testing Philosophy

This project follows **Test-Driven Development (TDD)** where possible:

1. **Write tests first** - Before implementing a feature, write failing tests that define the expected behavior
2. **Red-Green-Refactor** - Write failing test → Make it pass → Refactor
3. **Test types**:
   - **Unit tests**: For business logic in services (mock dependencies)
   - **Integration tests**: For repositories and database interactions (use Testcontainers)
   - **End-to-end tests**: For API endpoints (use MockMvc or WebTestClient)

### Test Naming Convention

```java
@Test
void methodName_stateUnderTest_expectedBehavior() {
    // Given / When / Then
}
```

### Test Organization

- Mirror the main source structure: `src/test/java/com/klassenzeit/klassenzeit/{package}/`
- Repository tests: `{Entity}RepositoryTest.java`
- Service tests: `{Entity}ServiceTest.java`
- Controller tests: `{Entity}ControllerTest.java`

### Integration Tests

Integration tests use Testcontainers to spin up a PostgreSQL container automatically.

```java
// Extend this base class for database integration tests
class MyTest extends AbstractIntegrationTest {
    // PostgreSQL container is available automatically
}
```
