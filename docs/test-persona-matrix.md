# E2E Test Persona Matrix

This matrix maps local development personas to their seeded memberships, expected landing surfaces, and current Playwright coverage.

## Personas

| Persona              | Organization role         | Basketball team role                          | Primary landing                                          | Coverage                                                                                                                                          |
| -------------------- | ------------------------- | --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                | owner                     | none required                                 | Organization performance                                 | `tests/auth-role-access.spec.ts`, `tests/team-management.spec.ts`                                                                                 |
| Team Manager         | athlete                   | manager                                       | Team performance portfolio                               | `tests/auth-role-access.spec.ts`, `tests/team-management.spec.ts`, `tests/library-access.spec.ts`, `tests/assignment-performance-access.spec.ts`  |
| Revoked Team Manager | athlete                   | manager, removed and restored in test cleanup | Team performance before removal; not-found after removal | `tests/tenant-isolation.spec.ts`                                                                                                                  |
| Athlete              | athlete                   | athlete                                       | Athlete dashboard                                        | `tests/auth-role-access.spec.ts`, `tests/assignment-performance-access.spec.ts`, `tests/tenant-isolation.spec.ts`                                 |
| Viewer               | viewer                    | viewer                                        | Organization performance                                 | `tests/auth-role-access.spec.ts`, `tests/library-access.spec.ts`, `tests/assignment-performance-access.spec.ts`, `tests/tenant-isolation.spec.ts` |
| Invalid              | no authenticated identity | none                                          | Local persona selector                                   | `tests/auth-role-access.spec.ts`                                                                                                                  |

## Scenario Coverage

| Capability                           | Owner  | Team Manager       | Viewer           | Athlete           | Test files                                    |
| ------------------------------------ | ------ | ------------------ | ---------------- | ----------------- | --------------------------------------------- |
| Role landing and route protection    | Yes    | Yes                | Yes              | Yes               | `tests/auth-role-access.spec.ts`              |
| Managed team operations              | Yes    | Yes                | No               | No                | `tests/team-management.spec.ts`               |
| Organization library management      | Yes    | Yes                | Read-only        | No                | `tests/library-access.spec.ts`                |
| Team assignment publication          | Yes    | Managed teams only | No               | No                | `tests/assignment-performance-access.spec.ts` |
| Athlete result logging               | Review | Review/comment     | Read-only review | Own assigned work | `tests/assignment-performance-access.spec.ts` |
| Team compliance and submitted review | Yes    | Managed teams      | Read-only        | No                | `tests/assignment-performance-access.spec.ts` |
| Tenant and membership isolation      | Yes    | Managed scope      | Read-only scope  | Own scope         | `tests/tenant-isolation.spec.ts`              |

## Seeded Identifiers

- Local organization: `10000000-0000-4000-8000-000000000001`
- Basketball team: `20000000-0000-4000-8000-000000000001`
- Foreign organization fixture: `10000000-0000-4000-8000-000000000099`
- Foreign team fixture: `20000000-0000-4000-8000-000000000099`

The local seed is applied by `npm run db:seed:local`. Tests create unique exercises, workouts, assignments, and sessions at runtime to avoid fixed-name collisions.

## Known Gaps

- Direct athlete-target publication has service coverage but needs a dedicated browser scenario.
- Submitted-result editing and cross-athlete result URLs need dedicated browser coverage.
- Manual scenario execution is represented here but is not yet maintained as a separate step-by-step QA checklist.
