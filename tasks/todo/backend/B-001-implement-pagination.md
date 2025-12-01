# B-001: Implement Pagination for List Endpoints

## Description
Add pagination support to all list endpoints to handle large datasets efficiently.

## Acceptance Criteria
- [ ] Add pagination parameters (`page`, `size`) to all list endpoints
- [ ] Update endpoints: `/schools/{schoolId}/teachers`, `/schools/{schoolId}/subjects`, `/schools/{schoolId}/classes`, `/schools/{schoolId}/rooms`
- [ ] Return pagination metadata (totalElements, totalPages, currentPage)
- [ ] Update OpenAPI spec to reflect pagination

## Dependencies
None

## Blocks
- [F-007: Frontend Pagination](../frontend/F-007-frontend-pagination.md)

## Notes
