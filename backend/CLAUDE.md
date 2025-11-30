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

# Run all quality checks (Spotless, Checkstyle, SpotBugs, PMD, tests)
./gradlew check

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

**IMPORTANT**: Always run `./gradlew check` after adding or modifying code to ensure all quality checks pass before committing.

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

Integration tests use Testcontainers to spin up a PostgreSQL container automatically.

```java
// Extend this base class for database integration tests
class MyTest extends AbstractIntegrationTest {
    // PostgreSQL container is available automatically
}
```

For Testcontainers to work locally with Podman, ensure `DOCKER_HOST` is set (see root CLAUDE.md).
