# Klassenzeit Data Model

This document describes the database schema for Klassenzeit, a school timetabler application.

## Entity Relationship Diagram

```mermaid
erDiagram
    School ||--o{ SchoolYear : has
    School ||--o{ Teacher : employs
    School ||--o{ Subject : offers
    School ||--o{ Room : contains
    School ||--o{ SchoolClass : has
    School ||--o{ TimeSlot : defines

    SchoolYear ||--o{ Term : contains

    Term ||--o{ Lesson : schedules
    Term ||--o{ TeacherAvailability : "applies to"

    Teacher ||--o{ TeacherSubjectQualification : has
    Teacher ||--o{ TeacherAvailability : has
    Teacher ||--o{ Lesson : teaches
    Teacher ||--o| SchoolClass : "is class teacher of"

    Subject ||--o{ TeacherSubjectQualification : qualifies
    Subject ||--o{ Lesson : "taught in"

    SchoolClass ||--o{ Lesson : attends
    Room ||--o{ Lesson : hosts
    TimeSlot ||--o{ Lesson : "scheduled at"

    School {
        uuid id PK
        string name
        string slug UK
        string school_type
        smallint min_grade
        smallint max_grade
        string timezone
        jsonb settings
    }

    SchoolYear {
        uuid id PK
        uuid school_id FK
        string name
        date start_date
        date end_date
        boolean is_current
    }

    Term {
        uuid id PK
        uuid school_year_id FK
        string name
        date start_date
        date end_date
        boolean is_current
    }

    Teacher {
        uuid id PK
        uuid school_id FK
        string first_name
        string last_name
        string email
        string abbreviation
        int max_hours_per_week
        boolean is_part_time
        boolean is_active
    }

    Subject {
        uuid id PK
        uuid school_id FK
        string name
        string abbreviation
        string color
    }

    Room {
        uuid id PK
        uuid school_id FK
        string name
        string building
        int capacity
        jsonb features
        boolean is_active
    }

    SchoolClass {
        uuid id PK
        uuid school_id FK
        string name
        smallint grade_level
        int student_count
        uuid class_teacher_id FK
        boolean is_active
    }

    TimeSlot {
        uuid id PK
        uuid school_id FK
        smallint day_of_week
        smallint period
        time start_time
        time end_time
        boolean is_break
        string label
    }

    TeacherSubjectQualification {
        uuid id PK
        uuid teacher_id FK
        uuid subject_id FK
        string qualification_level
        int_array can_teach_grades
        int max_hours_per_week
    }

    TeacherAvailability {
        uuid id PK
        uuid teacher_id FK
        uuid term_id FK
        smallint day_of_week
        smallint period
        string availability_type
        string reason
    }

    Lesson {
        uuid id PK
        uuid term_id FK
        uuid school_class_id FK
        uuid teacher_id FK
        uuid subject_id FK
        uuid room_id FK
        uuid timeslot_id FK
        string week_pattern
    }
```

## Entity Descriptions

### Core Entities

| Entity | Description |
|--------|-------------|
| **School** | The root tenant entity. Supports multi-tenant deployment where each school is isolated. |
| **SchoolYear** | An academic year (e.g., "2024/2025"). Contains terms. |
| **Term** | A period within a school year (e.g., "1. Halbjahr"). Lessons are scheduled per term. |

### Resource Entities

| Entity | Description |
|--------|-------------|
| **Teacher** | A teacher with availability constraints and max teaching hours. |
| **Subject** | A subject taught at the school (e.g., "Mathematik"). |
| **Room** | A physical room with capacity and features (projector, computers, etc.). |
| **SchoolClass** | A class/group of students (e.g., "3a", "5b"). |
| **TimeSlot** | Defines the weekly time grid (day + period + times). |

### Relationship Entities

| Entity | Description |
|--------|-------------|
| **TeacherSubjectQualification** | Tracks which subjects a teacher can teach and at what level (PRIMARY/SECONDARY/SUBSTITUTE). |
| **TeacherAvailability** | When a teacher is AVAILABLE, BLOCKED, or PREFERRED for scheduling. |
| **Lesson** | The actual scheduled timetable entry linking class, teacher, subject, room, and time slot. |

## Key Constraints

### Uniqueness Constraints

- `Lesson`: A class/teacher/room can only be in one place at a time (per term + timeslot + week_pattern)
- `Teacher.abbreviation`: Unique per school
- `Subject.abbreviation`: Unique per school
- `Room.name`: Unique per school
- `SchoolClass.name`: Unique per school

### Check Constraints

- `School.min_grade <= School.max_grade`
- `TimeSlot.start_time < TimeSlot.end_time`
- `TimeSlot.day_of_week` between 0 (Monday) and 4 (Friday)
- `TeacherAvailability.period` between 1 and 10

## Enums

| Enum | Values | Description |
|------|--------|-------------|
| `qualification_level` | PRIMARY, SECONDARY, SUBSTITUTE | Teacher's qualification for a subject |
| `availability_type` | AVAILABLE, BLOCKED, PREFERRED | Teacher's availability status for a time slot |
| `week_pattern` | EVERY, A, B | For A/B week rotation (default: EVERY) |

## Generating Documentation

Run `make db-docs` to generate interactive HTML documentation with ER diagrams from the live database using SchemaSpy.
