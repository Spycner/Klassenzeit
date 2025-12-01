# Klassenzeit Development Roadmap

This document outlines the next development steps for Klassenzeit, organized by priority and complexity.

## Status Legend
- [ ] Not started
- [x] Completed

---

## Phase 1: Foundation (Immediate)

### 1.1 Spring Data JPA Repositories
- [x] Create repository interfaces for all entities
- **Files to create:**
  - `backend/src/main/java/com/klassenzeit/klassenzeit/school/SchoolRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/school/SchoolYearRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/school/TermRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/teacher/TeacherRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/subject/SubjectRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/room/RoomRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/schoolclass/SchoolClassRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/timeslot/TimeSlotRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/lesson/LessonRepository.java`
- **Details:** Extend `JpaRepository<Entity, UUID>`. Add custom query methods as needed (e.g., `findBySchoolId`, `findBySchoolIdAndIsActiveTrue`).

### 1.2 REST API Setup
- [x] Add `spring-boot-starter-web` dependency
- [x] Create REST controllers for CRUD operations
- **Dependency added in `build.gradle.kts`:**
  ```kotlin
  implementation("org.springframework.boot:spring-boot-starter-web")
  ```
- **Controllers created:**
  - `SchoolController` - `/api/schools`
  - `SchoolYearController` - `/api/schools/{schoolId}/school-years`
  - `TermController` - `/api/schools/{schoolId}/school-years/{schoolYearId}/terms`
  - `TeacherController` - `/api/schools/{schoolId}/teachers`
  - `TeacherQualificationController` - `/api/schools/{schoolId}/teachers/{teacherId}/qualifications`
  - `TeacherAvailabilityController` - `/api/schools/{schoolId}/teachers/{teacherId}/availability`
  - `SubjectController` - `/api/schools/{schoolId}/subjects`
  - `RoomController` - `/api/schools/{schoolId}/rooms`
  - `SchoolClassController` - `/api/schools/{schoolId}/classes`
  - `TimeSlotController` - `/api/schools/{schoolId}/time-slots`
  - `LessonController` - `/api/schools/{schoolId}/terms/{termId}/lessons`
- **Supporting classes:**
  - `EntityNotFoundException` - Custom 404 exception
  - `GlobalExceptionHandler` - REST error handling
- **Endpoints pattern:**
  - `GET /api/schools/{schoolId}/teachers` - List teachers for a school
  - `POST /api/schools/{schoolId}/teachers` - Create teacher
  - `GET /api/schools/{schoolId}/teachers/{id}` - Get teacher
  - `PUT /api/schools/{schoolId}/teachers/{id}` - Update teacher
  - `DELETE /api/schools/{schoolId}/teachers/{id}` - Soft delete teacher

### 1.3 Development Seed Data
- [x] Create Flyway migration with sample data for local development
- **File:** `backend/src/main/resources/db/seed/V100__seed_dev_data.sql`
- **Contents:**
  - One sample school ("Demo Grundschule")
  - One school year (2024/2025) with two terms
  - 5-10 sample teachers with qualifications
  - Standard subjects (Deutsch, Mathematik, Sachunterricht, Sport, Kunst, Musik, Religion/Ethik)
  - Sample rooms (Klassenräume, Turnhalle, Musikraum)
  - Sample school classes (1a, 1b, 2a, 2b, 3a, 3b, 4a, 4b)
  - Time slot grid (Monday-Friday, periods 1-6)
  - Teacher availability (blocked/preferred time slots for part-time teachers)
- **Note:** Seed data is in a separate `db/seed/` folder and only loaded in dev profile via Flyway locations config.

---

## Phase 2: Core Features (Short-term)

### 2.1 Bean Validation
- [x] Add `spring-boot-starter-validation` dependency
- [x] Add validation annotations to DTOs
- **Dependency added in `build.gradle.kts`:**
  ```kotlin
  implementation("org.springframework.boot:spring-boot-starter-validation")
  ```
- **Annotations used:**
  - `@NotBlank` for required strings
  - `@Size(min, max)` for length constraints
  - `@Email` for email fields
  - `@Min`, `@Max` for numeric ranges
  - `@NotNull` for required non-string fields
  - `@Pattern` for regex validation (e.g., slug format)
  - `@Valid` for request body validation in controllers
- **GlobalExceptionHandler** updated to handle `MethodArgumentNotValidException` with structured error response

### 2.2 DTOs (Data Transfer Objects)
- [x] Create request/response DTOs for all entities
- **Purpose:** Decouple API contract from JPA entities, control what's exposed, handle nested relationships cleanly.
- **Pattern per entity (Java Records):**
  - `Create{Entity}Request` - For POST requests with required field validation
  - `Update{Entity}Request` - For PUT requests with optional fields (partial updates)
  - `{Entity}Response` - Full response with timestamps
  - `{Entity}Summary` - For list responses (minimal fields)
- **DTOs created for all entities:**
  - `school/dto/` - School, SchoolYear, Term DTOs
  - `teacher/dto/` - Teacher, Qualification, Availability DTOs
  - `subject/dto/` - Subject DTOs
  - `room/dto/` - Room DTOs
  - `schoolclass/dto/` - SchoolClass DTOs
  - `timeslot/dto/` - TimeSlot DTOs
  - `lesson/dto/` - Lesson DTOs

### 2.3 Service Layer
- [x] Create service classes with business logic
- **Services created:**
  - `SchoolService` - School CRUD operations
  - `SchoolYearService` - School year CRUD with school validation
  - `TermService` - Term CRUD with school year validation
  - `TeacherService` - Teacher CRUD with soft delete
  - `TeacherQualificationService` - Teacher qualification management
  - `TeacherAvailabilityService` - Teacher availability management
  - `SubjectService` - Subject CRUD with soft delete
  - `RoomService` - Room CRUD with soft delete
  - `SchoolClassService` - School class CRUD with soft delete
  - `TimeSlotService` - Time slot CRUD
  - `LessonService` - Lesson CRUD with term/school validation
- **Responsibilities:**
  - DTO to entity mapping (toResponse, toSummary methods)
  - Transaction management (`@Transactional`)
  - School/parent entity validation
  - Soft delete for entities with `isActive` flag
- **Pattern:**
  ```java
  @Service
  @Transactional(readOnly = true)
  public class TeacherService {
      @Transactional
      public TeacherResponse create(UUID schoolId, CreateTeacherRequest request) { ... }
  }
  ```
- **Controllers updated** to delegate to services (thin controller pattern)

---

## Phase 3: Timetabling (Medium-term)

### 3.1 Scheduling Constraints Model
- [ ] Define constraint types and their parameters
- **Constraint categories:**
  - **Hard constraints** (must be satisfied):
    - No teacher double-booking
    - No room double-booking
    - No class double-booking
    - Teacher must be qualified for subject
    - Teacher must be available (not blocked)
  - **Soft constraints** (preferences, scored):
    - Teacher preferred time slots
    - Minimize gaps in teacher schedules
    - Keep subjects spread across the week
    - Class teacher teaches first period
- **Data model options:**
  - Store constraints in database (flexible, user-configurable)
  - Define constraints in code (simpler for v1)

### 3.2 Timetabling Algorithm
- [ ] Evaluate and integrate a constraint solver
- **Options:**
  - **Timefold (formerly OptaPlanner)** - Java-native constraint solver, Apache licensed
  - **OR-Tools** - Google's optimization suite
  - **Custom greedy algorithm** - Simpler but less optimal
- **Recommended:** Timefold for Java ecosystem integration
- **Dependencies:**
  ```kotlin
  implementation("ai.timefold.solver:timefold-solver-core:1.x.x")
  implementation("ai.timefold.solver:timefold-solver-spring-boot-starter:1.x.x")
  ```
- **Implementation steps:**
  1. Define `@PlanningEntity` (Lesson with variable room/timeslot)
  2. Define `@PlanningSolution` (full timetable)
  3. Implement constraint providers
  4. Create solver configuration
  5. Build async solving with progress updates

### 3.3 Schedule Validation
- [ ] Implement pre-save validation for lessons
- [ ] Implement full schedule validation
- **Checks:**
  - Conflict detection (teacher, room, class overlaps)
  - Qualification verification
  - Availability checking
  - Capacity validation (room size vs. class size)
- **API:**
  - `POST /api/schools/{id}/lessons/validate` - Validate single lesson
  - `POST /api/schools/{id}/schedules/validate` - Validate full schedule

---

## Phase 4: Infrastructure

### 4.1 Authentication & Authorization
- [ ] Add Spring Security with JWT or session auth
- **Dependencies:**
  ```kotlin
  implementation("org.springframework.boot:spring-boot-starter-security")
  implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server") // For JWT
  ```
- **User roles:**
  - `ADMIN` - Full access to school
  - `PLANNER` - Can create/modify schedules
  - `TEACHER` - View own schedule, manage availability
  - `VIEWER` - Read-only access
- **Implementation options:**
  - Self-managed JWT (simpler)
  - OAuth2/OIDC with external provider (Keycloak, Auth0)

### 4.2 Multi-tenancy Enforcement
- [ ] Ensure all queries are scoped to user's school
- **Approaches:**
  - **Explicit:** Always pass `schoolId` and validate ownership
  - **Implicit:** Use Spring Security context + custom repository base class
  - **Hibernate filter:** Global filter applied automatically
- **Recommended for v1:** Explicit approach with service-layer validation

### 4.3 API Documentation
- [x] Add SpringDoc for automatic OpenAPI generation
- **Dependencies added in `build.gradle.kts`:**
  ```kotlin
  implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.9")
  ```
- **Configuration in `application.yaml`:**
  - API title, description, version
  - Swagger UI sorting options
- **Access:** Swagger UI at `/swagger-ui.html`, OpenAPI spec at `/v3/api-docs`

### 4.4 Actuator & Health Checks
- [x] Add Spring Boot Actuator for production readiness
- **Dependencies added in `build.gradle.kts`:**
  ```kotlin
  implementation("org.springframework.boot:spring-boot-starter-actuator")
  ```
- **Configuration in `application.yaml`:**
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
- **Endpoints:**
  - `/actuator/health` - Application and dependency health (DB, disk)
- **Note:** Required for CI to detect when backend is ready during E2E tests

### 4.5 Logging
- [ ] Configure structured logging for backend and frontend

**Backend (Spring Boot):**
- **Default:** Logback (already included)
- **Usage in code:**
  ```java
  private static final Logger log = LoggerFactory.getLogger(MyService.class);
  log.info("Processing lesson {}", lessonId);
  log.error("Failed to save", exception);
  ```
- **Configuration in `application.yaml`:**
  ```yaml
  logging:
    level:
      com.klassenzeit: DEBUG
      org.hibernate.SQL: DEBUG  # see SQL queries (dev only)
  ```
- **For production (structured JSON logs):**
  ```kotlin
  implementation("net.logstash.logback:logstash-logback-encoder:7.4")
  ```

**Frontend (React):**
- **Error tracking options:**
  - Sentry (`@sentry/react`) - Error boundaries, performance monitoring
  - LogRocket - Session replay + error tracking
- **Basic setup with Sentry:**
  ```bash
  npm install @sentry/react
  ```
  ```typescript
  // main.tsx
  Sentry.init({ dsn: "...", environment: import.meta.env.MODE });
  ```
- **Error boundary:** Wrap app to catch React errors gracefully
- **Console logging:** Use sparingly in dev, strip in production builds

---

## Future Considerations (Not in MVP)

- **Substitution management:** Track teacher absences and substitutes
- **Class groups:** Split classes for subjects like religion/ethics
- **Recurring patterns:** A/B week support (schema prepared)
- **Audit logging:** Track all changes for compliance
- **Import/Export:** CSV/Excel import for bulk data entry
- **Notifications:** Email/push for schedule changes
- **Mobile app:** Teacher-facing schedule viewer
- **Analytics:** Teaching load distribution, room utilization reports
- **Partial Rooms:** Support rooms / facilities that are partially available for lessons like swimming pools or gyms that are limited available to school classes or school classes that are limited available to a specific room.
- **Dedicated Rooms:** Support rooms / facilities that are dedicated to a specific subject or school class.
- **Subject Room Relationships:** Signify which subjects can be taught in which rooms.
- **Advanced Monitoring:** Grafana + Prometheus for metrics dashboards, centralized logging with Loki/ELK stack, Sentry for error tracking. Consider when production traffic warrants the operational overhead.