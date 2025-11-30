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
- [ ] Add `spring-boot-starter-web` dependency
- [ ] Create REST controllers for CRUD operations
- **Dependency to add in `build.gradle.kts`:**
  ```kotlin
  implementation("org.springframework.boot:spring-boot-starter-web")
  ```
- **Controllers to create:** Start with `SchoolController`, `TeacherController`, `SubjectController` for basic resource management.
- **Endpoints pattern:**
  - `GET /api/schools/{schoolId}/teachers` - List teachers for a school
  - `POST /api/schools/{schoolId}/teachers` - Create teacher
  - `GET /api/schools/{schoolId}/teachers/{id}` - Get teacher
  - `PUT /api/schools/{schoolId}/teachers/{id}` - Update teacher
  - `DELETE /api/schools/{schoolId}/teachers/{id}` - Soft delete teacher

### 1.3 Development Seed Data
- [ ] Create Flyway migration with sample data for local development
- **File:** `backend/src/main/resources/db/migration/V5__seed_dev_data.sql`
- **Contents:**
  - One sample school ("Demo Grundschule")
  - One school year (2024/2025) with two terms
  - 5-10 sample teachers with qualifications
  - Standard subjects (Deutsch, Mathematik, Sachunterricht, Sport, Kunst, Musik, Religion/Ethik)
  - Sample rooms (Klassenräume, Turnhalle, Musikraum)
  - Sample school classes (1a, 1b, 2a, 2b, 3a, 3b, 4a, 4b)
  - Time slot grid (Monday-Friday, periods 1-6)
- **Note:** Use a Spring profile (`dev`) to conditionally apply this migration only in development.

---

## Phase 2: Core Features (Short-term)

### 2.1 Bean Validation
- [ ] Add `spring-boot-starter-validation` dependency
- [ ] Add validation annotations to entities and DTOs
- **Dependency:**
  ```kotlin
  implementation("org.springframework.boot:spring-boot-starter-validation")
  ```
- **Annotations to use:**
  - `@NotBlank` for required strings
  - `@Size(min, max)` for length constraints
  - `@Email` for email fields
  - `@Min`, `@Max` for numeric ranges
  - `@Valid` for nested object validation
- **Example on Teacher:**
  ```java
  @NotBlank @Size(max = 100) private String firstName;
  @NotBlank @Size(max = 100) private String lastName;
  @Email @Size(max = 255) private String email;
  ```

### 2.2 DTOs (Data Transfer Objects)
- [ ] Create request/response DTOs for all entities
- **Purpose:** Decouple API contract from JPA entities, control what's exposed, handle nested relationships cleanly.
- **Pattern per entity:**
  - `CreateTeacherRequest` - For POST requests
  - `UpdateTeacherRequest` - For PUT requests
  - `TeacherResponse` - For GET responses
  - `TeacherSummaryResponse` - For list responses (fewer fields)
- **Location:** Create `dto` subpackage in each feature package (e.g., `teacher/dto/`).

### 2.3 Service Layer
- [ ] Create service classes with business logic
- **Files to create:**
  - `SchoolService`, `TeacherService`, `SubjectService`, `RoomService`, `SchoolClassService`, `TimeSlotService`, `LessonService`
- **Responsibilities:**
  - Validation beyond bean validation (e.g., checking uniqueness)
  - Transaction management
  - Cross-entity operations
  - Business rule enforcement (e.g., teacher can't exceed max hours)
- **Pattern:**
  ```java
  @Service
  @Transactional(readOnly = true)
  public class TeacherService {
      @Transactional
      public Teacher create(UUID schoolId, CreateTeacherRequest request) { ... }
  }
  ```

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
- [ ] Add SpringDoc for automatic OpenAPI generation
- **Dependencies:**
  ```kotlin
  implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.x.x")
  ```
- **Configuration:**
  - API title, description, version
  - Security scheme documentation
  - Example requests/responses
- **Access:** Swagger UI at `/swagger-ui.html`, OpenAPI spec at `/v3/api-docs`

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
