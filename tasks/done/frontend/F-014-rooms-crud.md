# F-014: Rooms CRUD Pages

## Description

Implement the rooms management pages including list view and create/edit forms, plus a subject suitability feature that links rooms to subjects they're suitable for.

## Acceptance Criteria

- [x] Create `pages/RoomsListPage.tsx`:
  - [x] Display rooms in DataTable
  - [x] Show name, building, capacity, active status
  - [x] "Add Room" button
  - [x] Row click navigates to detail
  - [x] Handle loading, empty, error states
- [x] Create `pages/RoomDetailPage.tsx`:
  - [x] Form for create/edit room
  - [x] Fields: name, building, capacity
  - [x] Delete confirmation for existing rooms
- [x] Create `pages/rooms/components/RoomForm.tsx`:
  - [x] Zod validation schema
  - [x] Form fields with proper labels and placeholders
- [x] Create Subject Suitability feature:
  - [x] Backend: RoomSubjectSuitability entity, repository, service, controller
  - [x] Backend: Database migration V10
  - [x] Backend: Unit tests for service
  - [x] Frontend: API service and React Query hooks
  - [x] Frontend: SubjectSuitabilitySection component
  - [x] Support isRequired flag for hard/soft constraints
- [x] Update routes in App.tsx
- [x] Add translations (EN + DE)

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)
- [F-013: Subjects CRUD](F-013-subjects-crud.md)

## Blocks

None

## Notes

### Design Decisions

1. **Subject-Room Relationships**: Created `RoomSubjectSuitability` join table (following `TeacherSubjectQualification` pattern) instead of using JSONB features field for subject relationships
2. **isRequired Flag**: Allows distinguishing between hard constraints (subject MUST be in suitable room) and soft constraints (prefer suitable rooms) for future solver integration
3. **Rooms with no suitabilities**: Are treated as general-purpose (any subject can use them)

### API Endpoints Created

- `GET /api/schools/{schoolId}/rooms/{roomId}/subjects` - List room subject suitabilities
- `POST /api/schools/{schoolId}/rooms/{roomId}/subjects` - Add subject suitability
- `DELETE /api/schools/{schoolId}/rooms/{roomId}/subjects/{id}` - Remove suitability

## Completion Notes

### Backend Files Created
- `backend/src/main/resources/db/migration/V10__create_room_subject_suitability.sql`
- `backend/src/main/java/com/klassenzeit/klassenzeit/room/RoomSubjectSuitability.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/room/dto/CreateRoomSubjectSuitabilityRequest.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/room/dto/RoomSubjectSuitabilitySummary.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/room/RoomSubjectSuitabilityRepository.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/room/RoomSubjectSuitabilityService.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/room/RoomSubjectSuitabilityController.java`
- `backend/src/test/java/com/klassenzeit/klassenzeit/room/RoomSubjectSuitabilityServiceTest.java`

### Backend Files Modified
- `backend/src/test/java/com/klassenzeit/klassenzeit/TestDataBuilder.java` - Added RoomSubjectSuitabilityBuilder

### Frontend Files Created
- `frontend/src/pages/RoomsListPage.tsx`
- `frontend/src/pages/RoomDetailPage.tsx`
- `frontend/src/pages/rooms/components/RoomForm.tsx`
- `frontend/src/pages/rooms/components/SubjectSuitabilitySection.tsx`
- `frontend/src/pages/rooms/components/index.ts`
- `frontend/src/api/services/room-subjects.ts`
- `frontend/src/api/hooks/use-room-subjects.ts`

### Frontend Files Modified
- `frontend/src/App.tsx` - Added room routes
- `frontend/src/api/hooks/query-client.ts` - Added roomSubjects query keys
- `frontend/src/api/hooks/index.ts` - Exported room subject hooks
- `frontend/src/api/services/index.ts` - Exported roomSubjectsApi
- `frontend/src/i18n/locales/en/pages.json` - Added rooms translations
- `frontend/src/i18n/locales/de/pages.json` - Added German rooms translations

### Frontend Files Deleted
- `frontend/src/pages/RoomsPage.tsx` - Replaced with RoomsListPage

### Tests
- Backend: All unit tests pass
- Frontend: TypeScript compiles, linting passes
