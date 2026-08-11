# Team Manager Functionality Implementation Checklist

## Objective

Give Team Managers a complete, team-scoped operating experience without granting organization-wide administration. A Team Manager must be able to manage assigned teams, maintain team rosters, assign training, review athlete compliance and submitted results, and comment on submitted sessions.

All reads and writes must remain scoped to the active organization and an explicitly authorized team.

## Required Team Manager Capabilities

- View a portfolio of teams they manage.
- View and update basic details for a managed team.
- Add, update, and remove team memberships.
- Invite a new athlete or staff member directly to a managed team.
- Read and manage the shared organization exercise, workout, and plan library.
- Create, update, publish, and cancel assignments that target only managed teams or athletes on those teams.
- View team assignment coverage, session status, compliance, and submitted results.
- Add operational comments to submitted sessions for athletes on managed teams.
- Move between team operations, assignments, library, and performance surfaces without seeing organization administration controls.

## Explicit Restrictions

A Team Manager must not be able to:

- Create or delete teams.
- Update or access an unmanaged team.
- Manage organization memberships or organization roles.
- Assign training organization-wide or to athletes outside managed teams.
- View results for athletes outside managed teams.
- Delete the organization, transfer ownership, or change organization settings.
- Export application data.
- Use a role in one organization to gain access in another organization.

## Current State

### Implemented Foundations

- [x] Team roles and effective permission composition.
- [x] Team Manager permissions for team update, roster management, library management, team assignment, result reads, and result comments.
- [x] Team membership service operations authorize against organization and team role.
- [x] Team Manager assignment service operations are restricted to managed teams.
- [x] Assignment list and detail queries accept a managed-team allowlist.
- [x] Managed-team portfolio and canonical team performance routes exist.
- [x] Session results and session comments have database schemas.
- [x] Session comment input validation exists.
- [x] Team Managers receive shared organization library access according to the documented policy.

### Missing or Incomplete

- [x] Dedicated team operations routes for Team Managers.
- [x] Team update service and UI.
- [x] Team-scoped roster UI and server actions.
- [x] Team invitation and acceptance flow for people who are not already organization members.
- [x] Assignment-authoring options scoped to managed teams and their athletes.
- [x] Team assignment and compliance read models.
- [x] Staff result-review route.
- [x] Session comment service, queries, actions, and UI.
- [x] Team Manager navigation to operational team controls.
- [x] End-to-end team-manager authorization and tenant-isolation coverage.

## Product and Architecture Decisions

### Route Ownership

- Keep `/app/admin` organization-only for Owners and Organization Managers.
- Keep `/app/performance/teams` and `/app/performance/teams/[teamId]` read-focused.
- Add `/app/teams` as the Team Manager operations portfolio.
- Add `/app/teams/[teamId]` for team settings, roster, and invitations.
- Add assignment and session drill-downs below the canonical team performance route.
- Organization Owners and Managers may use the same team routes through their organization-wide permissions.
- Team Viewers may use performance routes but never team operations routes.

### Team Access Context

Create one server-only team access resolver that:

1. Loads the active organization from the authenticated application context.
2. Loads the team by both `organizationId` and `teamId`.
3. Loads the actor's role for that team.
4. Resolves effective permissions from organization and team roles.
5. Returns a normalized context or fails without revealing a foreign team.

Every team route, query, and mutation must request the specific permission it needs. Route visibility is not authorization.

### Team Invitations

- Use a dedicated team invitation record rather than granting Team Managers access to organization invitations.
- A team invitation contains organization, team, normalized email, team role, creator, token hash, status, and expiration.
- Accepting a team invitation creates an Organization Athlete membership only when the user has no organization membership.
- Accepting then creates or updates the team membership transactionally.
- A Team Manager cannot choose or alter an organization role through this flow.
- Existing organization members may accept a team invitation without changing their organization role.
- Duplicate active invitations for the same team and email are rejected.

### Result Review and Comments

- Team Managers may review only sessions belonging to assignment recipients from managed teams.
- Initial result comments are staff operational comments; athlete visibility is out of scope until explicitly decided.
- Comments are append-only in the first version.
- Comments may be added only to submitted sessions.
- Comment reads and writes verify organization, team, assignment recipient, session, and actor scope on the server.

### Assignment Scope

- Team Managers see only managed teams in assignment target controls.
- Team Managers see only athletes who belong to a managed team.
- A Team Manager cannot target an athlete merely because that athlete belongs to the same organization.
- Assignment mutations continue to independently validate every submitted target.
- Mixed assignments spanning managed and unmanaged teams are rejected rather than partially accepted.

## Core Security Invariants

- Every team-owned query includes both `organizationId` and `teamId`.
- A client-provided team, assignment, athlete, session, or role identifier never establishes scope.
- Team Manager access is derived from current memberships on every sensitive request.
- Organization Owner and Manager access applies to every team in the active organization.
- Team Manager access applies only to teams where the actor currently has the Manager role.
- Team Viewer access is read-only.
- Team Athlete access is limited to their own athlete workflow and results.
- Removing a Team Manager membership revokes access immediately.
- Team invitation acceptance cannot create Manager or Viewer organization access.
- Assignment and result queries must prevent cross-team and cross-organization data leakage.
- Team membership, invitation acceptance, and other multi-record operations are transactional.

## Priority Sequence

1. Harden team access resolution and existing assignment target reads.
2. Add team operations routes and team settings.
3. Add roster management for existing organization members.
4. Add team invitation onboarding.
5. Add team assignment and compliance reporting.
6. Add submitted-result review and comments.
7. Complete navigation, accessibility, auditability, and regression coverage.

## Milestone 1: Access Boundary and Existing Flow Hardening

### Requirements

- Establish one reusable team authorization boundary before adding routes.
- Close existing Team Manager read-model gaps in assignment authoring.
- Preserve organization-level access for Owners and Organization Managers.

### Implementation Checklist

- [x] Add a server-only `loadAuthorizedTeamContext` helper.
- [x] Require an explicit permission when resolving team access.
- [x] Return not-found behavior for foreign-organization and inaccessible team identifiers.
- [x] Add unit tests for Owner, Organization Manager, Team Manager, Team Viewer, Team Athlete, missing membership, and foreign organization.
- [x] Scope assignment team options to managed teams for Team Managers.
- [x] Scope assignment athlete options to members of managed teams for Team Managers.
- [x] Preserve all-team and all-athlete options for organization-wide assignment managers.
- [x] Add negative tests for crafted unmanaged team and athlete targets.
- [x] Audit assignment list and detail reads for mixed-target visibility.

### Acceptance Criteria

- [x] Team Managers cannot discover unmanaged teams or athletes through assignment pages.
- [x] Submitted unmanaged targets fail even if form values are manipulated.
- [x] Organization Owners and Managers retain organization-wide assignment behavior.
- [x] Team Viewers and Athletes cannot access assignment authoring.

## Milestone 2: Team Operations and Settings

### Requirements

- Team Managers need an operational entry point separate from organization Admin.
- Team Managers can update a managed team's permitted settings but cannot create or delete teams.

### Implementation Checklist

- [x] Add `/app/teams` operations portfolio.
- [x] List only teams for which the actor has `team.update` or `team.members.manage`.
- [x] Add `/app/teams/[teamId]` team operations route.
- [x] Add a team settings read model scoped by organization and team.
- [x] Add Zod validation for editable team fields.
- [x] Add `updateTeam` application service operation.
- [x] Add repository support for an organization-scoped team update.
- [x] Add a team settings server action with structured feedback.
- [x] Confirm optimistic versioning is not required while team settings remain name-only.
- [x] Add empty, not-found, forbidden, pending, success, and error states.
- [x] Add route and service tests for managed, unmanaged, and foreign teams.

### Acceptance Criteria

- [x] A Team Manager can open and rename a managed team.
- [x] A Team Manager cannot create or delete a team.
- [x] A Team Manager cannot update an unmanaged or foreign team.
- [x] An Organization Owner or Manager can manage any team in the active organization.

## Milestone 3: Team Roster Management

### Requirements

- Team Managers can maintain memberships for an authorized team.
- Organization membership and role administration remain inaccessible.

### Implementation Checklist

- [x] Add a roster section to `/app/teams/[teamId]`.
- [x] List only members of the selected team.
- [x] Add a scoped lookup for eligible existing organization members without exposing the full organization directory by default.
- [x] Reuse or adapt `addOrUpdateTeamMember` for the team route.
- [x] Reuse or adapt `removeTeamMember` for the team route.
- [x] Add route-local Zod schemas and server actions.
- [x] Allow only valid Team roles: Manager, Viewer, Athlete.
- [x] Confirm whether self-demotion and self-removal are allowed; encode the decision in service invariants and tests.
- [x] Add confirmation UI for removal and role changes.
- [x] Ensure removing the final team membership does not remove the organization membership.
- [x] Add service, action, and integration tests for add, role update, and removal.

### Acceptance Criteria

- [x] A Team Manager can add an eligible existing user to a managed team.
- [x] A Team Manager can change a managed team member's Team role.
- [x] A Team Manager can remove a member from a managed team.
- [x] No operation changes the target user's organization role.
- [x] Every operation rejects unmanaged and foreign teams.

## Milestone 4: Team Invitations and Athlete Onboarding

### Requirements

- Team Managers need to invite people who do not yet have an application or organization membership.
- Acceptance must preserve tenant and role boundaries.

### Implementation Checklist

- [x] Add a forward-only migration for `team_invitations`.
- [x] Add organization/team ownership foreign keys and indexes.
- [x] Add pending, accepted, revoked, and expired states.
- [x] Add unique active invitation enforcement for team plus normalized email.
- [x] Store only a secure token hash.
- [x] Add invitation creation, revocation, lookup, and acceptance repositories.
- [x] Add create, revoke, and accept application services.
- [x] Authorize creation and revocation with `team.members.manage` for the invitation's team.
- [x] On acceptance, create an Organization Athlete membership only when one does not exist.
- [x] Preserve an existing organization role during acceptance.
- [x] Create or update the Team membership transactionally.
- [x] Add pending invitation UI to the team operations route.
- [x] Add an unauthenticated/authenticated acceptance route with anti-enumeration behavior.
- [x] Add expiration, replay, revocation, duplicate, wrong-email, cross-team, and cross-organization tests.

### Acceptance Criteria

- [x] A Team Manager can invite an email directly to a managed team.
- [x] Acceptance creates the minimum required organization access and requested Team role.
- [x] Acceptance never grants organization-wide management or viewing access.
- [x] Tokens are single-use and expired or revoked tokens fail safely.
- [x] A Team Manager cannot create or inspect invitations for an unmanaged team.

## Milestone 5: Team Assignment and Compliance Dashboard

### Requirements

- The canonical team performance page must show actionable training coverage and progress.
- Read models must calculate on the server and remain team-scoped.

### Implementation Checklist

- [x] Define status and compliance terminology for assigned, in-progress, submitted, missed, and upcoming sessions.
- [x] Add a team assignment summary query scoped by organization and team.
- [x] Include source name/type, assignment dates, recipient count, session status counts, and latest activity.
- [x] Add time-window filters using the organization/assignment timezone.
- [x] Extend `/app/performance/teams/[teamId]` with assignment and compliance summaries.
- [x] Add `/app/performance/teams/[teamId]/assignments/[assignmentId]`.
- [x] Verify that the assignment targets the selected team before returning detail.
- [x] Show team recipients and their occurrence/session statuses.
- [x] Link submitted sessions to result review.
- [x] Provide explicit loading, empty, unavailable, and error states.
- [x] Add query integration tests for direct-athlete and team-target assignments.
- [x] Add tests for mixed team membership, removed athletes, canceled assignments, and cross-team access.

### Acceptance Criteria

- [x] Team Managers can see current assignment coverage and completion for managed teams.
- [x] Team Viewers receive the same authorized read view without mutation controls.
- [x] Assignment detail contains only recipients associated with the selected team.
- [x] Unmanaged and foreign assignment identifiers return no data.

## Milestone 6: Submitted Result Review and Comments

### Requirements

- Team Managers can inspect submitted workout results for athletes on managed teams.
- Comments are authorized independently of result visibility.

### Implementation Checklist

- [x] Add a staff session-result detail query scoped by organization, team, assignment, recipient, and session.
- [x] Return snapshot exercise labels and submitted result metrics in deterministic order.
- [x] Add session comment list and insert repository operations.
- [x] Add an application service for appending a session comment.
- [x] Require `results.read.all` to view team results.
- [x] Require `results.comment` to append a comment.
- [x] Require the session to be submitted before accepting a comment.
- [x] Add `/app/performance/teams/[teamId]/assignments/[assignmentId]/sessions/[sessionId]`.
- [x] Add a comment server action using the existing Zod input schema.
- [x] Render comment author, body, and timestamp without exposing sensitive identifiers.
- [x] Treat comments as append-only in this milestone.
- [x] Add tests for Team Manager, Team Viewer, Athlete, unmanaged team, foreign organization, non-submitted session, and malformed comment body.

### Acceptance Criteria

- [x] Team Managers can review submitted metrics and comment within managed teams.
- [x] Team Viewers can review results but cannot comment.
- [x] Athletes cannot use staff result routes to inspect teammates.
- [x] Comments cannot be appended to in-progress or assigned sessions.
- [x] No result or comment data leaks across teams or organizations.

## Milestone 7: Navigation, Auditability, and UX Completion

### Requirements

- Team Manager workflows must be discoverable and accessible.
- Sensitive team operations must be diagnosable without logging private athlete result payloads.

### Implementation Checklist

- [x] Add a Team Management navigation item when the actor manages at least one team.
- [x] Add contextual links between Team Management, Team Performance, Assignments, and Library.
- [x] Keep organization Admin hidden and inaccessible to Team Managers without organization management access.
- [x] Add useful empty states for no roster, no assignments, and no submitted results.
- [x] Add visible focus, semantic headings, accessible names, and keyboard-complete controls.
- [x] Verify responsive behavior for team roster and performance tables.
- [x] Add audit events for team settings changes, member changes, and invitation lifecycle actions.
- [x] Do not log raw result payloads or comment bodies.
- [x] Update `docs/access-control.md` and `docs/app-functionality.md` for finalized behavior.

### Acceptance Criteria

- [x] A Team Manager can complete common workflows without entering organization Admin.
- [x] Team Viewer and Team Athlete navigation contain no mutation entry points.
- [x] All controls remain usable on mobile and by keyboard.
- [x] Sensitive mutations emit one sanitized audit event.

## Test Matrix

### Roles

- [x] Organization Owner across any team in the active organization.
- [x] Organization Manager across any team in the active organization.
- [x] Team Manager on a managed team.
- [x] Team Manager on an unmanaged team.
- [x] Team Viewer read-only behavior.
- [x] Team Athlete own-data behavior.
- [x] Organization-only Athlete with no Team membership.

### Isolation

- [x] Same organization, different team.
- [x] Different organization with a reused or guessed identifier.
- [x] Actor removed from the team between page load and mutation.
- [x] Target athlete removed from the team between page load and mutation.
- [x] Assignment targeting multiple teams.
- [x] Session belonging to a direct athlete target.

### Invitation Lifecycle

- [x] New user.
- [x] Existing application user without organization membership.
- [x] Existing organization member.
- [x] Existing team member.
- [x] Duplicate pending invite.
- [x] Expired, revoked, accepted, and replayed token.
- [x] Signed-in email does not match invited email.

### Result Review

- [x] Assigned, in-progress, and submitted sessions.
- [x] Fixed-day and weekly-frequency plan occurrences.
- [x] Standalone workout assignments.
- [x] Canceled assignments and historical submitted sessions.
- [x] Viewer read without comment permission.

## Suggested Execution Slices

- [x] Slice A: Team access resolver, tests, and assignment option scoping.
- [x] Slice B: Team operations portfolio, settings service, actions, and tests.
- [x] Slice C: Existing-member roster management UI and action tests.
- [x] Slice D: Team invitation schema, service, acceptance flow, and tests.
- [x] Slice E: Team assignment/compliance read models and dashboard UI.
- [x] Slice F: Submitted result detail and session comments.
- [x] Slice G: Navigation, audit events, accessibility, documentation, and final hardening.

Each slice should be independently reviewable and validated before the next slice begins.

## Done Definition

- [x] Every Required Team Manager Capability is implemented.
- [x] Every Explicit Restriction has negative test coverage.
- [x] All sensitive reads and writes authorize active organization and team scope on the server.
- [x] New schema changes use forward-only migrations and database constraints.
- [x] Unit, integration, route/action, and component tests cover changed behavior.
- [x] Mobile, keyboard, focus, empty, loading, error, and disabled states are verified.
- [x] `npm run validate` passes.
- [x] `npm run build` passes.
- [x] Access-control and application-functionality documentation reflects shipped behavior.
