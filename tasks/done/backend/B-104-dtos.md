# B-104: DTOs (Data Transfer Objects)

## Description
Create request/response DTOs for all entities to decouple API contract from JPA entities.

## Completion Notes

### Purpose
- Decouple API contract from JPA entities
- Control what's exposed
- Handle nested relationships cleanly

### Pattern per Entity (Java Records)
- `Create{Entity}Request` - For POST requests with required field validation
- `Update{Entity}Request` - For PUT requests with optional fields (partial updates)
- `{Entity}Response` - Full response with timestamps
- `{Entity}Summary` - For list responses (minimal fields)

### DTOs Created
- `school/dto/` - School, SchoolYear, Term DTOs
- `teacher/dto/` - Teacher, Qualification, Availability DTOs
- `subject/dto/` - Subject DTOs
- `room/dto/` - Room DTOs
- `schoolclass/dto/` - SchoolClass DTOs
- `timeslot/dto/` - TimeSlot DTOs
- `lesson/dto/` - Lesson DTOs
