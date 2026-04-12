# ADR 0006: Self-rolled cookie-session authentication

**Status:** Accepted
**Date:** 2026-04-12

## Context

The Klassenzeit backend needs authentication to protect endpoints. The system is closed (invite-only), serves ~dozens of users, has a single backend, and no mobile clients.

## Decision

Self-rolled cookie-session auth with a server-side `sessions` table, argon2id password hashing, and NIST 800-63B password validation.

### Rejected alternatives

- **JWT:** Stateless tokens complicate revocation (need a denylist or short-lived tokens + refresh dance). Not justified for a single-backend monolith.
- **Keycloak (self-hosted OIDC):** Ops overhead (upgrades, backups, realm config) exceeds the value for a closed system with ~dozens of users.
- **Third-party hosted (Clerk, Auth0):** Vendor dependency the maintainer wants to avoid; adds an external service for a use case that doesn't need it.

## Consequences

- We own password storage security. argon2id mitigates this.
- Revocation is trivial: delete a row.
- No external dependency for auth.
- MFA, OAuth, and social login are future work if the threat model or user base changes.
