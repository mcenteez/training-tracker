# Auth, AuthZ, and Membership Phase 2 Implementation Checklist

## Objective

Harden and complete tenant-safe authorization workflows after initial authentication/bootstrap.

## Scope

- Membership invitation and acceptance lifecycle
- Centralized authorization guard patterns
- Organization and team membership lifecycle controls
- Effective-permission and precedence enforcement
- Tenant-isolation verification and regression coverage
- Audit events for security-sensitive membership actions

## Priority Sequence

1. Invitations
2. Centralized guards
3. Membership lifecycle actions
4. Effective-permission rules
5. Tenant isolation audit
6. Audit events
7. UX and error-state polish

## Milestone 1: Organization Invitations

### Requirements

- Owners and organization managers can invite users by email to an organization role.
- Supported invited roles: manager, viewer, athlete.
- Invitation has status model (pending, accepted, revoked, expired).
- Invitation expiration is enforced server-side.
- Owners and managers can revoke pending invitations.
- Duplicate active invites for the same email and organization are prevented.

### Implementation Checklist

- [x] Add organization invitation table and migration.
- [x] Add unique and safety constraints:
  - [x] Unique pending invite per organization + email.
  - [x] Organization foreign key and createdBy foreign key.
- [x] Add repository/query helpers for invite creation and lifecycle transitions.
- [x] Add service methods:
  - [x] createOrganizationInvitation
  - [x] revokeOrganizationInvitation
  - [x] acceptOrganizationInvitation
- [x] Add server actions and route handlers for invite create/revoke/accept.
- [x] Add onboarding/accept-invite route and UI.
- [x] Add anti-enumeration behavior for unknown invite tokens.

### Acceptance Criteria

- [x] Owner can invite a new email to an organization role.
- [x] Invited user can sign in and accept invitation exactly once.
- [x] Revoked and expired invitations cannot be accepted.
- [x] Accepting invitation creates or updates membership transactionally.
- [x] No cross-organization invitation acceptance is possible.

## Milestone 2: Centralized Authorization Guards

### Requirements

- Shared guard helpers are used by all server mutations and sensitive reads.
- Authorization checks are deterministic and role-aware.
- Guard outputs include a normalized context object for downstream operations.

### Implementation Checklist

- [x] Introduce guard module under access-control application boundary.
- [x] Add standardized guards:
  - [x] requireAuthenticatedUser
  - [x] requireOrganizationAccess
  - [x] requireOrganizationRoleAtLeast
  - [x] requireTeamAccess
  - [x] requireTeamRoleAtLeast
- [x] Refactor existing app actions to use shared guards.
- [ ] Replace ad hoc redirect/error branching with standard behavior.
- [ ] Ensure every mutation path verifies organization scope server-side.

### Acceptance Criteria

- [x] No app action performs role checks inline without a guard helper.
- [ ] Unauthorized actions fail in a consistent way.
- [x] Guard behavior is covered with unit tests and representative integration tests.

## Milestone 3: Membership Lifecycle Management

### Requirements

- Owner can transfer ownership.
- Owner and manager can remove organization members per policy.
- Last-owner and ownership invariants are always preserved.
- Organization membership changes cascade safely to team memberships.

### Implementation Checklist

- [x] Add service operations:
  - [x] transferOrganizationOwnership
  - [x] updateOrganizationMembershipRole
  - [x] removeOrganizationMembership
- [x] Enforce invariants:
  - [x] Organization must always have exactly one owner.
  - [x] Owner cannot be removed without transfer.
  - [x] Role demotions respect privilege requirements.
- [x] Add transactional cascade handling for dependent team memberships.
- [ ] Add optimistic UI and confirmation dialogs for destructive actions.

### Acceptance Criteria

- [x] Ownership transfer preserves exactly one owner.
- [x] Removing org membership removes dependent team memberships in one transaction.
- [x] Managers cannot escalate privileges beyond policy.

## Milestone 4: Effective Access and Role Precedence Enforcement

### Requirements

- Effective access is calculated consistently across organization and team roles.
- Organization roles apply organization-wide.
- Team roles can grant additional team-only access but cannot reduce org-level access.

### Implementation Checklist

- [x] Implement one effective-permission resolver utility used across modules.
- [x] Encode precedence from access-control requirements document.
- [x] Refactor team/member operations to consume resolver.
- [x] Add safety assertions for mismatched organization/team ownership chains.

### Acceptance Criteria

- [x] Permission outcomes match documented precedence for all role combinations.
- [x] Team role never downgrades organization-level access.
- [x] Cross-team privilege leakage is prevented.

## Milestone 5: Tenant Isolation Verification Pass

### Requirements

- Every tenant-owned query and mutation is organization-scoped.
- No client-provided identifiers are trusted without authorization.

### Implementation Checklist

- [ ] Audit all query paths in modules for organization scoping.
- [ ] Add explicit negative tests for cross-organization access.
- [ ] Add checklist enforcement in code review template.
- [ ] Add integration tests around sensitive flows (invite, transfer ownership, remove membership).

### Acceptance Criteria

- [ ] Cross-tenant read/write attempts are rejected for every tested path.
- [ ] All sensitive paths include explicit organization context checks.

## Milestone 6: Security Audit Events

### Requirements

- Security-sensitive membership and role changes are recorded.
- Event records include actor, target, organization, action, and timestamp.

### Implementation Checklist

- [ ] Add audit event schema and migration.
- [ ] Log events for:
  - [ ] invite created/revoked/accepted
  - [ ] membership role changed
  - [ ] membership removed
  - [ ] ownership transferred
- [ ] Ensure event writes are transactionally consistent with source actions.
- [ ] Add read model for internal admin troubleshooting view.

### Acceptance Criteria

- [ ] Every sensitive membership mutation emits exactly one audit event.
- [ ] Event payloads contain enough context for operational debugging.

## Milestone 7: UX and Failure-State Completion

### Requirements

- Access-denied and empty states are clear and role-aware.
- Membership management feedback is consistent and actionable.

### Implementation Checklist

- [ ] Standardize success/error banners for membership actions.
- [ ] Add role-aware disabled states for unauthorized controls.
- [ ] Add dedicated unauthorized page or section messaging.
- [ ] Add invitation status UI (pending, revoked, expired, accepted).

### Acceptance Criteria

- [ ] Users receive clear next steps for every blocked action.
- [ ] No silent failures for membership/authorization actions.

## Test Plan Checklist

### Unit

- [ ] Access-control guard utilities
- [ ] Effective-permission resolver
- [ ] Membership lifecycle service invariants
- [x] Invitation token/state transitions

### Integration

- [ ] Invitation create, revoke, accept end-to-end server flow
- [ ] Ownership transfer transaction behavior
- [ ] Organization membership removal cascade
- [ ] Team role updates with organization-scope verification

### Security and Tenant Isolation

- [ ] Cross-organization mutation attempts fail
- [ ] Cross-team unauthorized access attempts fail
- [ ] Athlete cannot view or mutate another athlete data paths

## Done Definition

- [ ] All milestone acceptance criteria complete.
- [ ] Tests added or updated for changed behavior.
- [ ] npm run validate passes.
- [ ] npm run build passes.
- [ ] Documentation updates complete for changed behavior and policies.

## Suggested Execution Slices

1. [x] Slice A: Invitations data model + service + tests
2. [x] Slice B: Invitation UI + accept flow + tests
3. [x] Slice C: Centralized guards refactor + tests
4. [x] Slice D: Membership lifecycle commands + transactional invariants
5. [x] Slice E: Effective-permission resolver adoption
6. [ ] Slice F: Tenant-isolation test expansion
7. [ ] Slice G: Audit events + UX polish
