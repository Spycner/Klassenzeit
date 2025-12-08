# Fix Delete Button Race Condition in SubjectSuitabilitySection

## Description
In `SubjectSuitabilitySection.tsx`, `isRemoving` is `deleteMutation.isPending` which is true for ANY delete in progress, not just the specific suitability being removed. This disables all delete buttons when any single delete is pending.

## Acceptance Criteria
- [x] Track which specific suitability ID is being deleted
- [x] Only disable the delete button for the item being removed
- [x] Other delete buttons remain clickable during deletion
- [x] Visual feedback shows which item is being deleted

## Context
- Found by: code-quality agent
- Priority: LOW
- Effort: Small
- Related files:
  - `frontend/src/pages/rooms/components/SubjectSuitabilitySection.tsx:235`

## Notes
Fix approach:
```typescript
const [removingId, setRemovingId] = useState<string | null>(null);

const handleRemove = (id: string) => {
  setRemovingId(id);
  deleteMutation.mutate(id, {
    onSettled: () => setRemovingId(null)
  });
};

// In render:
disabled={removingId === suitability.id}
```

## Completion Notes
Implemented the fix as planned:
1. Added `removingId` state to track the specific suitability being deleted
2. Modified `handleRemove` to set `removingId` before mutation and clear it in finally block
3. Changed `isRemoving` prop from `deleteMutation.isPending` to `removingId === suitability.id`
4. Added test case in `SubjectSuitabilitySection.test.tsx` to verify the fix works correctly
