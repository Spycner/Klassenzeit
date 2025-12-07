# API Reference

This document describes the REST API endpoints for Klassenzeit.

## Base URL

```
http://localhost:8080/api
```

## Authentication

All API endpoints require a valid JWT token from Keycloak (except where noted).

```http
Authorization: Bearer <jwt-token>
```

See [Authentication & Authorization](authentication.md) for details on obtaining tokens and the permission model.

## OpenAPI Documentation

Interactive API documentation is available at:
- **Swagger UI**: `http://localhost:8080/swagger-ui.html`
- **OpenAPI JSON**: `http://localhost:8080/v3/api-docs`

## Endpoints Overview

| Resource | Base Path | Auth |
|----------|-----------|------|
| [Users](#users) | `/api/users` | User |
| [Schools](#schools) | `/api/schools` | Varies |
| [Platform Admin](#platform-admin) | `/api/admin/schools` | Platform Admin |
| [Members](#school-members) | `/api/schools/{schoolId}/members` | School Admin |
| [Access Requests](#access-requests) | `/api/schools/{schoolId}/access-requests` | Varies |
| [Teachers](#teachers) | `/api/schools/{schoolId}/teachers` | School Member |
| [Teacher Availability](#teacher-availability) | `/api/schools/{schoolId}/teachers/{teacherId}/availability` | School Member |
| [Teacher Qualifications](#teacher-qualifications) | `/api/schools/{schoolId}/teachers/{teacherId}/qualifications` | School Member |
| [Subjects](#subjects) | `/api/schools/{schoolId}/subjects` | School Member |
| [Rooms](#rooms) | `/api/schools/{schoolId}/rooms` | School Member |
| [Classes](#classes) | `/api/schools/{schoolId}/classes` | School Member |
| [Time Slots](#time-slots) | `/api/schools/{schoolId}/time-slots` | School Member |
| [School Years](#school-years) | `/api/schools/{schoolId}/school-years` | School Member |
| [Terms](#terms) | `/api/schools/{schoolId}/school-years/{yearId}/terms` | School Member |
| [Lessons](#lessons) | `/api/schools/{schoolId}/terms/{termId}/lessons` | School Member |
| [Solver](#timetable-solver) | `/api/schools/{schoolId}/terms/{termId}/solver` | Planner+ |

---

## Users

### Get Current User Profile

```http
GET /api/users/me
```

Returns the authenticated user's profile with their school memberships.

**Response** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "displayName": "User Name",
  "isPlatformAdmin": false,
  "memberships": [
    {
      "schoolId": "uuid",
      "schoolName": "Example School",
      "role": "SCHOOL_ADMIN",
      "isActive": true
    }
  ]
}
```

### Search Users

```http
GET /api/users/search?q={query}
```

Search for users by email or display name. Only platform admins and users with school memberships can search.

**Query Parameters**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search term (min 3 characters) |

### Cancel Access Request

```http
DELETE /api/users/me/access-requests/{id}
```

Cancel a pending access request. Users can only cancel their own requests.

**Response** `204 No Content`

---

## Schools

### List Schools

```http
GET /api/schools
```

Returns schools the current user has access to.

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "Example School",
    "slug": "example-school",
    "schoolType": "Gymnasium"
  }
]
```

### Get School

```http
GET /api/schools/{identifier}
```

Get school by UUID or slug. Returns 301 redirect if accessing via an old slug.

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `identifier` | string | School UUID or slug |

**Response** `200 OK`
```json
{
  "id": "uuid",
  "name": "Example School",
  "slug": "example-school",
  "schoolType": "Gymnasium",
  "minGrade": 5,
  "maxGrade": 13,
  "timezone": "Europe/Berlin",
  "settings": {}
}
```

### Create School

```http
POST /api/schools
```

**Authorization**: Platform Admin only

**Request Body**
```json
{
  "name": "New School",
  "slug": "new-school",
  "schoolType": "Gymnasium",
  "minGrade": 5,
  "maxGrade": 13
}
```

**Response** `201 Created`

### Update School

```http
PUT /api/schools/{id}
```

**Authorization**: School Admin only

### Delete School

```http
DELETE /api/schools/{id}
```

**Authorization**: School Admin only

**Response** `204 No Content`

---

## Platform Admin

### Assign School Admin

```http
POST /api/admin/schools/{schoolId}/admins
```

**Authorization**: Platform Admin only

Assign an initial school admin to a newly created school.

**Request Body**
```json
{
  "userId": "uuid"
}
```

---

## School Members

### List Members

```http
GET /api/schools/{schoolId}/members
```

**Authorization**: School Admin only

### Get Member

```http
GET /api/schools/{schoolId}/members/{id}
```

**Authorization**: School Admin only

### Add Member

```http
POST /api/schools/{schoolId}/members
```

**Authorization**: School Admin only

**Request Body**
```json
{
  "userId": "uuid",
  "role": "PLANNER"
}
```

### Update Member Role

```http
PUT /api/schools/{schoolId}/members/{id}
```

**Authorization**: School Admin only

**Request Body**
```json
{
  "role": "TEACHER",
  "linkedTeacherId": "uuid"
}
```

### Remove Member

```http
DELETE /api/schools/{schoolId}/members/{id}
```

**Authorization**: School Admin only

**Response** `204 No Content`

---

## Access Requests

### Request Access

```http
POST /api/schools/{schoolId}/access-requests
```

Any authenticated user can request access to a school.

**Request Body**
```json
{
  "requestedRole": "TEACHER",
  "message": "I'm a new teacher at this school"
}
```

### List Access Requests

```http
GET /api/schools/{schoolId}/access-requests
```

**Authorization**: School Admin only

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | `PENDING` | Filter by status |

### Get Access Request

```http
GET /api/schools/{schoolId}/access-requests/{id}
```

**Authorization**: School Admin only

### Review Access Request

```http
PUT /api/schools/{schoolId}/access-requests/{id}
```

**Authorization**: School Admin only

**Request Body**
```json
{
  "decision": "APPROVE",
  "responseMessage": "Welcome!",
  "grantedRole": "TEACHER"
}
```

---

## Teachers

All teacher endpoints require school membership for read access, and School Admin or Planner role for write access.

### List Teachers

```http
GET /api/schools/{schoolId}/teachers
```

### Get Teacher

```http
GET /api/schools/{schoolId}/teachers/{id}
```

### Create Teacher

```http
POST /api/schools/{schoolId}/teachers
```

**Request Body**
```json
{
  "firstName": "Max",
  "lastName": "Mustermann",
  "email": "max@school.de",
  "abbreviation": "MUS",
  "maxHoursPerWeek": 26,
  "isPartTime": false
}
```

### Update Teacher

```http
PUT /api/schools/{schoolId}/teachers/{id}
```

### Delete Teacher (Soft)

```http
DELETE /api/schools/{schoolId}/teachers/{id}
```

Soft delete (sets `isActive = false`).

### Delete Teacher (Permanent)

```http
DELETE /api/schools/{schoolId}/teachers/{id}/permanent
```

Permanently removes the teacher record.

---

## Teacher Availability

### List Availability

```http
GET /api/schools/{schoolId}/teachers/{teacherId}/availability
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `termId` | UUID | Filter by term |

### Get Availability

```http
GET /api/schools/{schoolId}/teachers/{teacherId}/availability/{id}
```

### Create Availability

```http
POST /api/schools/{schoolId}/teachers/{teacherId}/availability
```

**Request Body**
```json
{
  "termId": "uuid",
  "dayOfWeek": 1,
  "period": 3,
  "availabilityType": "BLOCKED",
  "reason": "Doctor appointment"
}
```

### Update Availability

```http
PUT /api/schools/{schoolId}/teachers/{teacherId}/availability/{id}
```

### Delete Availability

```http
DELETE /api/schools/{schoolId}/teachers/{teacherId}/availability/{id}
```

---

## Teacher Qualifications

### List Qualifications

```http
GET /api/schools/{schoolId}/teachers/{teacherId}/qualifications
```

### Create Qualification

```http
POST /api/schools/{schoolId}/teachers/{teacherId}/qualifications
```

**Request Body**
```json
{
  "subjectId": "uuid",
  "qualificationLevel": "PRIMARY",
  "canTeachGrades": [5, 6, 7, 8],
  "maxHoursPerWeek": 10
}
```

### Update Qualification

```http
PUT /api/schools/{schoolId}/teachers/{teacherId}/qualifications/{id}
```

### Delete Qualification

```http
DELETE /api/schools/{schoolId}/teachers/{teacherId}/qualifications/{id}
```

---

## Subjects

### List Subjects

```http
GET /api/schools/{schoolId}/subjects
```

### Get Subject

```http
GET /api/schools/{schoolId}/subjects/{id}
```

### Create Subject

```http
POST /api/schools/{schoolId}/subjects
```

**Request Body**
```json
{
  "name": "Mathematik",
  "abbreviation": "MA",
  "color": "#3B82F6"
}
```

### Update Subject

```http
PUT /api/schools/{schoolId}/subjects/{id}
```

### Delete Subject

```http
DELETE /api/schools/{schoolId}/subjects/{id}
```

---

## Rooms

### List Rooms

```http
GET /api/schools/{schoolId}/rooms
```

### Get Room

```http
GET /api/schools/{schoolId}/rooms/{id}
```

### Create Room

```http
POST /api/schools/{schoolId}/rooms
```

**Request Body**
```json
{
  "name": "Room 101",
  "building": "Main Building",
  "capacity": 30,
  "features": {"projector": true, "computers": 15}
}
```

### Update Room

```http
PUT /api/schools/{schoolId}/rooms/{id}
```

### Delete Room

```http
DELETE /api/schools/{schoolId}/rooms/{id}
```

---

## Classes

### List Classes

```http
GET /api/schools/{schoolId}/classes
```

### Get Class

```http
GET /api/schools/{schoolId}/classes/{id}
```

### Create Class

```http
POST /api/schools/{schoolId}/classes
```

**Request Body**
```json
{
  "name": "5a",
  "gradeLevel": 5,
  "studentCount": 25,
  "classTeacherId": "uuid"
}
```

### Update Class

```http
PUT /api/schools/{schoolId}/classes/{id}
```

### Delete Class

```http
DELETE /api/schools/{schoolId}/classes/{id}
```

---

## Time Slots

### List Time Slots

```http
GET /api/schools/{schoolId}/time-slots
```

### Get Time Slot

```http
GET /api/schools/{schoolId}/time-slots/{id}
```

### Create Time Slot

```http
POST /api/schools/{schoolId}/time-slots
```

**Request Body**
```json
{
  "dayOfWeek": 0,
  "period": 1,
  "startTime": "08:00",
  "endTime": "08:45",
  "isBreak": false,
  "label": "1. Stunde"
}
```

### Update Time Slot

```http
PUT /api/schools/{schoolId}/time-slots/{id}
```

### Delete Time Slot

```http
DELETE /api/schools/{schoolId}/time-slots/{id}
```

---

## School Years

### List School Years

```http
GET /api/schools/{schoolId}/school-years
```

### Get School Year

```http
GET /api/schools/{schoolId}/school-years/{id}
```

### Create School Year

```http
POST /api/schools/{schoolId}/school-years
```

**Request Body**
```json
{
  "name": "2024/2025",
  "startDate": "2024-08-01",
  "endDate": "2025-07-31",
  "isCurrent": true
}
```

### Update School Year

```http
PUT /api/schools/{schoolId}/school-years/{id}
```

### Delete School Year

```http
DELETE /api/schools/{schoolId}/school-years/{id}
```

---

## Terms

### List Terms

```http
GET /api/schools/{schoolId}/school-years/{schoolYearId}/terms
```

### Get Term

```http
GET /api/schools/{schoolId}/school-years/{schoolYearId}/terms/{id}
```

### Create Term

```http
POST /api/schools/{schoolId}/school-years/{schoolYearId}/terms
```

**Request Body**
```json
{
  "name": "1. Halbjahr",
  "startDate": "2024-08-01",
  "endDate": "2025-01-31",
  "isCurrent": true
}
```

### Update Term

```http
PUT /api/schools/{schoolId}/school-years/{schoolYearId}/terms/{id}
```

### Delete Term

```http
DELETE /api/schools/{schoolId}/school-years/{schoolYearId}/terms/{id}
```

---

## Lessons

### List Lessons

```http
GET /api/schools/{schoolId}/terms/{termId}/lessons
```

### Get Lesson

```http
GET /api/schools/{schoolId}/terms/{termId}/lessons/{id}
```

### Create Lesson

```http
POST /api/schools/{schoolId}/terms/{termId}/lessons
```

**Request Body**
```json
{
  "schoolClassId": "uuid",
  "teacherId": "uuid",
  "subjectId": "uuid",
  "roomId": "uuid",
  "timeslotId": "uuid",
  "weekPattern": "EVERY"
}
```

### Update Lesson

```http
PUT /api/schools/{schoolId}/terms/{termId}/lessons/{id}
```

### Delete Lesson

```http
DELETE /api/schools/{schoolId}/terms/{termId}/lessons/{id}
```

---

## Timetable Solver

The solver uses Timefold to generate optimal timetables.

### Start Solving

```http
POST /api/schools/{schoolId}/terms/{termId}/solver/solve
```

**Authorization**: Planner or School Admin

Starts the solver asynchronously.

**Response** `202 Accepted`
```json
{
  "status": "SOLVING",
  "score": null,
  "startedAt": "2024-01-15T10:30:00Z"
}
```

### Get Solver Status

```http
GET /api/schools/{schoolId}/terms/{termId}/solver/status
```

Returns the current solving status and score.

**Response** `200 OK`
```json
{
  "status": "SOLVING",
  "score": "0hard/-5soft",
  "startedAt": "2024-01-15T10:30:00Z",
  "duration": "PT5M30S"
}
```

### Stop Solving

```http
POST /api/schools/{schoolId}/terms/{termId}/solver/stop
```

**Authorization**: Planner or School Admin

Terminates the solver early, keeping the best solution found.

**Response** `204 No Content`

### Get Solution

```http
GET /api/schools/{schoolId}/terms/{termId}/solver/solution
```

Returns the current best timetable solution.

### Apply Solution

```http
POST /api/schools/{schoolId}/terms/{termId}/solver/apply
```

**Authorization**: Planner or School Admin

Persists the current best solution to the database.

**Response** `204 No Content`

---

## Common Response Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `204` | No Content (successful delete) |
| `301` | Redirect (e.g., old school slug) |
| `400` | Bad Request (validation error) |
| `401` | Unauthorized (missing/invalid token) |
| `403` | Forbidden (insufficient permissions) |
| `404` | Not Found |
| `409` | Conflict (e.g., duplicate entry) |
| `422` | Unprocessable Entity |
| `500` | Internal Server Error |

## Error Response Format

```json
{
  "timestamp": "2024-01-15T10:30:00.000+00:00",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/schools",
  "errors": [
    {
      "field": "name",
      "message": "Name is required"
    }
  ]
}
```
