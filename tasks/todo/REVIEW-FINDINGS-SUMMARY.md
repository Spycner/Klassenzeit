# Code Review Findings - Task Summary

Generated from comprehensive review of `feat/review-setup` branch on 2025-12-07.

## Task Overview

| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| B-023 | Fix N+1 Query Patterns | MEDIUM | Medium | Todo |
| B-024 | Improve Security Test Coverage | MEDIUM | Medium | Todo |
| B-025 | Improve User Package Coverage | MEDIUM | Medium | Todo |
| B-026 | Harden CORS Configuration | LOW | Small | Todo |
| F-024 | Improve API Hooks Coverage | MEDIUM | Large | ✅ **DONE** |
| F-025 | Improve API Services Coverage | MEDIUM | Medium | ⏭️ Skipped |
| F-026 | Add Auth Module Tests | MEDIUM | Medium | Todo |
| F-027 | Fix schoolId Handling | LOW | Small | ✅ **DONE** |
| G-012 | Create Missing Documentation | MEDIUM | Large | Todo |
| G-013 | Fix E2E Test Flakiness | LOW | Medium | Todo |

---

## Logical Groupings


### Group 2: Backend Quality (Can Work Together)

**These tasks are related and can be done in parallel by different developers or sequentially by one:**

```
┌─────────────────────────────────────┐
│  B-023: Fix N+1 Queries             │
│  - Repository JOIN FETCH            │
│  - Add composite index              │
│  Effort: ~2-3 hours                 │
└─────────────────────────────────────┘
          │
          │ (independent)
          ▼
┌─────────────────────────────────────┐
│  B-024: Security Test Coverage      │──────┐
│  - UserResolutionFilter tests       │      │
│  - SecurityConfig tests             │      │ (can work
│  - AuthorizationService tests       │      │  in parallel)
│  Effort: ~4-6 hours                 │      │
└─────────────────────────────────────┘      │
                                             │
┌─────────────────────────────────────┐      │
│  B-025: User Package Coverage       │◄─────┘
│  - AppUserService tests             │
│  - AppUserController tests          │
│  Effort: ~3-4 hours                 │
└─────────────────────────────────────┘
          │
          │ (after above)
          ▼
┌─────────────────────────────────────┐
│  B-026: Harden CORS (Optional)      │
│  - Restrict allowed headers         │
│  Effort: ~30 minutes                │
└─────────────────────────────────────┘
```

### Group 3: Frontend Test Coverage ✅ COMPLETED

**Completed on 2025-12-07:**

```
┌─────────────────────────────────────┐
│  F-024: API Hooks Coverage          │ ✅ DONE
│  - Added 88 new tests               │
│  - Added MSW handlers for 8 entities│
│  - 14/14 hooks now have tests       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  F-025: API Services Coverage       │ ⏭️ SKIPPED
│  - Services tested indirectly       │
│  - Via hook tests + API client tests│
│  - Minimal additional value         │
└─────────────────────────────────────┘
```

### Group 4: Auth Testing (Independent)

```
┌─────────────────────────────────────┐
│  F-026: Auth Module Tests           │
│  - AuthProvider tests               │
│  - ProtectedRoute tests             │
│  - Mock Keycloak setup              │
│  Effort: ~3-4 hours                 │
└─────────────────────────────────────┘
```

### Group 5: Minor Fixes ✅ COMPLETED

**Completed on 2025-12-07:**

```
┌─────────────────────────────────────┐
│  F-027: Fix schoolId Handling       │ ✅ DONE
│  - Added localStorage validation    │
│  - Fixed mutation hook parameters   │
│  - Added comprehensive tests        │
└─────────────────────────────────────┘
```

### Group 6: Documentation (Independent)

```
┌─────────────────────────────────────┐
│  G-012: Create Documentation        │
│  - API docs                         │
│  - Data model docs                  │
│  - Auth guide                       │
│  Effort: ~4-6 hours                 │
└─────────────────────────────────────┘
```

### Group 7: Infrastructure (Independent)

```
┌─────────────────────────────────────┐
│  G-013: Fix E2E Flakiness           │
│  - Create test user pool            │
│  - Update Playwright config         │
│  Effort: ~2-3 hours                 │
└─────────────────────────────────────┘
```

---

## Recommended Work Order

### Immediate (Before Merge)
1. **B-022** - Fix critical security issues (~30 min)

### Sprint 1 - Backend Focus
2. **B-023** - Fix N+1 queries (~2-3 hours)
3. **B-024** + **B-025** - Backend test coverage (~8-10 hours, can parallelize)

### Sprint 2 - Frontend Focus
4. ~~**F-024** + **F-025** - API layer test coverage~~ ✅ **COMPLETED** (F-025 skipped - covered by hook tests)
5. **F-026** - Auth module tests (~3-4 hours)

### Ongoing / As Time Permits
6. **G-012** - Documentation (~4-6 hours)
7. **G-013** - E2E flakiness (~2-3 hours)
8. **B-026** - CORS hardening (~30 min)
9. **F-027** - schoolId edge cases (~1 hour)

---

## Dependencies

```
B-022 ──► None (do first, blocking)
B-023 ──► None
B-024 ──► B-022 (test the fixes)
B-025 ──► None
B-026 ──► None
F-024 ──► None (but do with F-025)
F-025 ──► None (but do with F-024)
F-026 ──► None
F-027 ──► None
G-012 ──► None
G-013 ──► None
```

---

## Total Effort Estimate

| Priority | Tasks | Estimated Hours |
|----------|-------|-----------------|
| HIGH (Blocking) | B-022 | 0.5 |
| MEDIUM | B-023, B-024, B-025, F-024, F-025, F-026, G-012 | 30-40 |
| LOW | B-026, F-027, G-013 | 3-5 |
| **Total** | | **~35-45 hours** |
