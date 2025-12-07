# F-022: Add School Members Feature

## Description

Implement the ability to add new members to a school from the Schools management page. Currently the "Add Member" button is disabled because there's no way to search for users.

## Background

The Schools management page (F-019) was implemented with member viewing and role editing, but adding new members requires a user search/lookup capability that doesn't exist yet.

## Requirements

### Backend
- Add `GET /api/users/search?email={email}` endpoint to find users by email
- Or `GET /api/users?email={email}` with filtering support
- Only return basic user info (id, email, displayName)
- Authorization: Platform admins or school admins can search

### Frontend
- Enable "Add Member" button in MembersSection
- Add member dialog with:
  - Email input field
  - Role selector (SCHOOL_ADMIN, PLANNER, TEACHER, VIEWER)
  - Optional: Link to teacher (for TEACHER role)
- Handle case where user doesn't exist (show helpful message)
- Use `useCreateMembership` hook (already exists)

## Acceptance Criteria

- [ ] School admin can add a new member by entering their email
- [ ] Role can be selected when adding a member
- [ ] Error shown if user with email doesn't exist in system
- [ ] Success message and list refresh after adding member
- [ ] Works in both German and English

## Technical Notes

- Backend: `AppUserRepository.findByEmail()` exists, just needs controller endpoint
- Frontend: `useCreateMembership` hook and `membershipsApi.create()` already implemented
- Consider: Should we allow inviting users who haven't logged in yet? (future scope)

## Related Tasks

- F-019: Schools CRUD Pages (parent feature)
- B-020: Authentication & Authorization (provides user context)
