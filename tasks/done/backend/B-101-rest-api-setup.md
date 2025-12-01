# B-101: REST API Setup

## Description
Add Spring Boot Web dependency and create REST controllers for CRUD operations.

## Completion Notes

### Dependencies Added
```kotlin
implementation("org.springframework.boot:spring-boot-starter-web")
```

### Controllers Created
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

### Supporting Classes
- `EntityNotFoundException` - Custom 404 exception
- `GlobalExceptionHandler` - REST error handling

### Endpoint Pattern
- `GET /api/schools/{schoolId}/teachers` - List teachers for a school
- `POST /api/schools/{schoolId}/teachers` - Create teacher
- `GET /api/schools/{schoolId}/teachers/{id}` - Get teacher
- `PUT /api/schools/{schoolId}/teachers/{id}` - Update teacher
- `DELETE /api/schools/{schoolId}/teachers/{id}` - Soft delete teacher
