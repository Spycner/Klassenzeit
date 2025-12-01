# B-100: Spring Data JPA Repositories

## Description
Create repository interfaces for all entities using Spring Data JPA.

## Completion Notes

### Files Created
- `backend/src/main/java/com/klassenzeit/klassenzeit/school/SchoolRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/school/SchoolYearRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/school/TermRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/teacher/TeacherRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/subject/SubjectRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/room/RoomRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/schoolclass/SchoolClassRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/timeslot/TimeSlotRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/lesson/LessonRepository.java`

### Implementation Details
- All repositories extend `JpaRepository<Entity, UUID>`
- Custom query methods added as needed (e.g., `findBySchoolId`, `findBySchoolIdAndIsActiveTrue`)
