# Playwright E2E Test Plan Implementation Checklist

## Objective

Provide browser-level confidence that the Training Tracker product works as intended across the core user flows in production-like behavior, without depending on live Clerk OAuth or manually-created production accounts.

The test strategy should exercise the same server-side authorization and data boundaries used in the app, while using the local persona auth pattern for deterministic browser automation.

## Scope

- Local auth and persona switching
- Organization and team role routing
- Team management and roster operations
- Library exercise and workout management
- Assignment creation, publication, and snapshot integrity
- Athlete result logging and review flows
- Team compliance and result commentary
- Cross-tenant and unauthorized access regression checks
- Manual QA parity with Playwright automation

## Current State

### Implemented Foundations

- [x] Local auth mode is configured to allow deterministic persona testing in development.
- [x] Local persona cookie and allowlist exist for Owner, Manager, Athlete, and Viewer scenarios.
- [x] The dev auth selector route exists for switching personas in the browser.
- [x] Playwright is configured for local browser testing with a local dev server fallback.
- [x] A first Playwright suite covers role routing and local persona login flows.
- [x] README and docs describe how to run local-auth manual and automated testing.
- [x] The app resolves role-based landing pages from current organization and team memberships.
- [x] Server-side access rules are consistently enforced outside the UI.

### Execution Slice Status

- [x] Slice A: Auth and role-routing protection — complete
  - Verified in [tests/auth-role-access.spec.ts](../tests/auth-role-access.spec.ts)
  - Covers owner, manager, athlete, viewer, invalid persona, and clear persona scenarios.
- [x] Slice B: Library access and mutation gating — complete
  - Verified in [tests/library-access.spec.ts](../tests/library-access.spec.ts)
  - Covers manager create flow and viewer read-only behavior.
- [x] Slice C: Team management and membership — implemented
  - Verified in [tests/team-management.spec.ts](../tests/team-management.spec.ts)
  - Covers managed-team portfolio scoping, settings updates, roster add/role/remove, organization-admin denial, and unmanaged-team denial.
- [x] Slice D: Assignment publication and snapshot integrity — happy path implemented
- [x] Slice E: Athlete result logging and review — happy path implemented
- [x] Slice F: Team performance and compliance review — access and review coverage implemented
- [ ] Slice G: Tenant isolation and regression coverage — not started

### Missing or Incomplete

- [x] Assignment publication and assignment-snapshot verification
- [x] Athlete result logging and in-progress edit flow coverage
- [x] Team compliance and staff review flows
- [ ] Cross-organization and cross-team security regression tests
- [ ] Shared Playwright helpers for persona-driven flows
- [ ] A reusable test data factory for assignment and result scenarios
- [ ] Coverage for inaccessible route and UI states
- [ ] Documentation link between product capability docs and the E2E test matrix

### Completed this iteration

- [x] Auth and role-routing smoke suite exists as its own Playwright feature file.
- [x] Library read-only vs. manager-create coverage exists as its own Playwright feature file.
- [x] Manager-only create flow confirmed in browser.
- [x] Viewer read-only library behavior confirmed in browser.
- [x] The auth and library feature suites passed in a combined Playwright run.

## Product and Architecture Decisions

### Local Auth Strategy

- Keep the real app logic, authorization, and database access paths intact.
- Use a local persona cookie to simulate authenticated sessions during local development and Playwright runs.
- Keep Clerk as the production authentication provider and reject local auth in production.
- Test the app through the same routes and server checks used by real users.

### Browser Automation Philosophy

- Prefer scenario-driven tests over mock-heavy UI tests.
- Verify visible product behavior and route outcomes instead of implementation details.
- Reuse the seeded Basketball organization and role memberships for deterministic work.
- Keep one set of persona-based test scenarios that can be used both manually and in automation.

### Functional Coverage Priorities

1. Auth and route protection
2. Team management and memberships
3. Library authoring and activation
4. Assignment publication and scheduling
5. Athlete result logging
6. Team performance, compliance, and comments
7. Cross-tenant leakage and access regressions

## Core Security Invariants

- Every browser flow must use real application authorization rules.
- Local personas must resolve through the same server-side user and organization context as production auth.
- Team and organization role checks must remain server-side and cannot be bypassed by client manipulation.
- Cross-organization and cross-team access must fail in browser tests just as in production logic.
- A persona must never grant access beyond the seeded organization membership data.
- Assignment and result modes must retain publish-time scoping rules for historical data.

## Priority Sequence

1. Harden the existing local-login and role-routing smoke suite.
2. Add team management and roster tests.
3. Add library exercise and workout tests.
4. Add assignment creation and publication tests.
5. Add athlete result logging and compliance tests.
6. Add tenant-isolation and regression tests.
7. Add shared helpers and cleanup utilities for maintainability.

## Milestone 1: Auth and Route Protection

### Requirements

- Validate the persona auth path works from manual browser selection and programmatic scenario setup.
- Prove role-based landing pages and forbidden-route behavior are consistent.
- Ensure invalid or cleared personas redirect to the local auth selector.

### Implementation Checklist

- [x] Keep the current smoke suite for Owner, Manager, Athlete, Viewer, invalid persona, and clear persona flows.
- [x] Split auth/role coverage into a dedicated Playwright feature file.
- [x] Add route guard coverage for Admin and staff-only links not visible or accessible to athletes.
- [x] Add landing-page checks for organization performance, managed teams, and athlete dashboard.
- [x] Add regression checks for stale or missing auth state.

### Acceptance Criteria

- [x] Owner, Manager, Athlete, and Viewer personas all land on the expected route.
- [x] Invalid or missing persona state redirects to the auth selector.
- [x] Athlete cannot access the Admin route or organization-only pages.
- [x] Viewer cannot reach mutating surfaces.

## Milestone 2: Team Management and Membership Flows

### Requirements

- A Team Manager can manage an authorized team without gaining organization-wide administration rights.
- Team members can be added, updated, and removed correctly.
- Membership changes remain scoped to the active organization and team.

### Implementation Checklist

- [x] Add a team portfolio page test for managed teams only.
- [x] Add team details update flow and validation checks.
- [x] Add test for adding a team member with a valid team role.
- [x] Add test for changing a team member role without touching organization role.
- [x] Add test for removing a team member from a managed team.
- [x] Add unauthorized test for a Team Manager attempting to modify unmanaged teams.
- [x] Add negative test for a Team Manager trying to access organization member management.
- [ ] Add negative test for role changes that would broaden organization scope.

### Acceptance Criteria

- [x] A Team Manager can open and edit only managed-team settings.
- [x] Team membership changes are reflected in the UI and persisted in the app data.
- [x] A Team Manager cannot use team flows to manage organization members.
- [x] Unmanaged teams remain hidden or inaccessible.

## Milestone 3: Library Exercise and Workout Management

### Requirements

- Organization-level library workflows are fully reachable in the browser.
- Exercises and workouts can be created, edited, activated, and archived/restored.
- Workout drafts and activation rules are validated in the UI and server paths.

### Implementation Checklist

- [x] Add test for creating a valid exercise with required metadata.
- [x] Add test for editing an existing exercise.
- [x] Add test for archiving and restoring an exercise.
- [x] Add test for creating a workout with multiple blocks.
- [x] Add test for saving a workout as a draft.
- [x] Add test for rejecting activation of an invalid draft.
- [x] Add test for successfully activating a valid workout.
- [ ] Add test for duplicating a workout into a new draft.
- [ ] Add test for organization-scoped library separation.

### Acceptance Criteria

- [x] Manager and Owner roles can create and manage library items.
- [x] Viewer roles cannot mutate the library.
- [x] Incomplete workouts cannot be activated.
- [x] Valid workouts can be activated and reused in assignments.
- [ ] Library items remain scoped to the active organization.

## Milestone 4: Assignment Creation and Publication

### Requirements

- Managers can assign workouts and plans to managed teams or athletes.
- Assignment publication respects target scopes and availability windows.
- Published assignments preserve snapshot integrity after template changes.

### Implementation Checklist

- [x] Add test for creating a simple assignment from an existing template.
- [x] Add test for publishing an assignment to a team target.
- [ ] Add test for publishing to athlete target(s) only within managed scope.
- [ ] Add test for rejection when a target is outside allowed team or athlete scope.
- [x] Add test for assignment list and detail pages reflecting correct recipients and status.
- [x] Add test for snapshot behavior after editing a library workout that was already assigned.
- [ ] Add test for assignment coverage and compliance summary views.
- [ ] Add test for a Viewer or Athlete not being able to publish or edit assignments.

### Acceptance Criteria

- [x] Valid assignments publish successfully.
- [ ] Invalid targets are rejected before a mutation completes.
- [x] Assignment detail reflects the publish-time snapshot rather than live library mutations.
- [ ] Team roles cannot assign outside their managed scope.

## Milestone 5: Athlete Result Logging and Review

### Requirements

- Athletes can record and update their own results for assigned workouts.
- Staff can review assigned athlete results and compliance summaries.
- Team viewers can read result data but cannot append comments.
- Team managers may comment on submitted sessions when authorized.

### Implementation Checklist

- [x] Add athlete flow test for viewing assigned workout and schedule.
- [x] Add athlete test for logging a workout result.
- [ ] Add athlete test for editing an already-submitted result.
- [ ] Add athlete negative test for viewing another athlete's result data.
- [x] Add staff compliance page test for assigned athletes and session status.
- [x] Add manager comment flow for submitted athlete results.
- [x] Add viewer read-only flow for submitted results and comments.
- [ ] Add negative test for team viewer trying to add comments.

### Acceptance Criteria

- [ ] Athlete can log and update only their own result data.
- [ ] Team staff can view scoped compliance and result review pages.
- [ ] Team Viewer can read but not mutate.
- [ ] Team Manager can append allowed comments only for managed-team cases.

## Milestone 6: Team Performance and Staff Review

### Requirements

- Team performance dashboards reflect assigned, in-progress, submitted, missed, and upcoming workload.
- Staff can drill down into sessions and recipients without leaking cross-team data.
- Historical billing, compliance, and comment contexts remain scoped to publish-time assignment provenance.

### Implementation Checklist

- [x] Add test for team performance dashboard rendering for valid manager role.
- [ ] Add test for assignment drill-down by athlete and occurrence.
- [x] Add test for timeline and status totals across 30-day / 90-day / all-time views.
- [x] Add test for viewer-only read access on team performance surfaces.
- [ ] Add negative test for trying to access foreign team results.
- [x] Add negative test for athlete access to staff result review routes.

### Acceptance Criteria

- [ ] Staff sees only authorized team performance details.
- [ ] Athletes cannot access review routes for other athletes or other teams.
- [ ] Result and compliance data remain tied to the correct team assignment scope.

## Milestone 7: Tenant Isolation and Regression Coverage

### Requirements

- Browser tests confirm no cross-tenant leakage or unauthorized route access.
- Security regressions are caught at the product boundary using realistic scenarios.

### Implementation Checklist

- [ ] Add test for a user in Organization A not accessing Organization B data.
- [ ] Add test for a Team Manager in one team not seeing another team's performance details.
- [ ] Add test for stale organization selection redirecting to organization selection flow.
- [x] Add test for invalid direct route parameters failing safely.
- [ ] Add test for a removed team manager losing access on the next sensitive request.
- [ ] Add regression test for attempted tampering with assignment target IDs.
- [ ] Add regression test for data export or read-only controls not being available to unauthorized users.

### Acceptance Criteria

- [ ] No cross-organization data is visible in browser tests.
- [ ] Team-scoped access remains enforced after membership changes.
- [ ] Parameter tampering fails safely without exposing unrelated data.

## Test Plan Checklist

### Unit and Integration

- [ ] Local persona auth configuration tests
- [ ] Route and landing decision tests
- [ ] Access-control guard tests
- [ ] Invitation and membership lifecycle tests
- [ ] Assignment and result service tests

### Browser / E2E

- [ ] Role landing flow tests
- [ ] Team management tests
- [ ] Library CRUD tests
- [ ] Assignment publication tests
- [ ] Athlete result logging tests
- [ ] Team performance and comment tests
- [ ] Security regression tests

### Manual QA Parity

- [ ] Local persona selector works in browser
- [ ] Manual QA can switch between roles without creating Clerk accounts
- [ ] Manual scenario matrix matches Playwright persona matrix
- [ ] Browser-based validation confirms route access and UI states remain correct

## Done Definition

- [ ] Core auth and route-protection suite exists and passes.
- [ ] Team management flow tests exist and pass.
- [ ] Library creation and activation tests exist and pass.
- [ ] Assignment publication and snapshot tests exist and pass.
- [ ] Athlete result logging and review tests exist and pass.
- [ ] Security and tenant-isolation tests exist and pass.
- [ ] Documentation and manual-run instructions remain up to date.
- [ ] npm run validate passes.
- [ ] npm run build passes.

## Suggested Execution Slices

1. [x] Slice A: Role and route smoke tests
2. [x] Slice B: Team management and roster tests
3. [x] Slice C: Library exercise and workout tests
4. [x] Slice D: Assignment publication and history tests
5. [x] Slice E: Athlete result and result-review tests
6. [x] Slice F: Team performance and compliance tests
7. [ ] Slice G: Cross-tenant security regressions and cleanup
