# Access Control Requirements

## Purpose

Training Tracker is a multi-tenant application. Access is determined by a user's membership and role within an organization or team.

This document defines the agreed authorization model. It should guide the database schema, authorization policies, user interfaces, and tests.

## Core Structure

- A user may belong to multiple organizations.
- An organization has exactly one Owner and contains many teams.
- A team belongs to exactly one organization.
- An athlete may belong to multiple organizations and teams.
- An athlete may remain in an organization without belonging to a team.

## Organization Roles

### Owner

- Has full access to the organization and every team it contains.
- Manages all organization members and roles.
- Creates and deletes teams.
- Deletes the organization.
- Transfers ownership to another user.
- An organization must always have exactly one Owner.

### Manager

- Manages organization members, including inviting and removing other Managers.
- Creates, updates, and deletes teams.
- Manages athletes, workouts, assignments, and results across the organization.
- Can comment on athlete-submitted results for operational review.
- Cannot delete the organization.
- Cannot transfer ownership.

### Viewer

- Reads organization and team information.
- Cannot create, update, delete, assign, or export data.

### Athlete

An Athlete organization membership represents a user who participates as an athlete but has no organization-wide administrative access.

- Accesses only their own athlete-facing information.
- Cannot see another athlete's results.
- May belong to the organization without belonging to a team.

## Team Roles

### Manager

- Manages the assigned team.
- Manages team athletes, workouts, assignments, and results.
- Can comment on athlete-submitted results within managed teams.
- Cannot assign workouts organization-wide.
- Cannot manage teams to which they have not been assigned unless an organization role grants that access.

### Viewer

- Reads information for the assigned team.
- Cannot modify, assign, or export data.

### Athlete

- Views workouts assigned to them.
- Records and updates their own results.
- Views only their own results and progress.
- Cannot view teammates' results.

## Membership Rules

- A user may hold only one role per organization.
- A user may hold only one role per team.
- A user's roles may differ between teams. For example, a user may manage one team and be an athlete on another.
- Joining a team automatically creates an Athlete membership in its organization when the user does not already have an organization membership.
- Removing an organization membership also removes every team membership held by that user in the organization.
- Removing a user from their final team does not automatically remove their organization membership.
- An Owner cannot be removed until ownership is transferred.
- Ownership transfer must replace the existing Owner; it must never leave an organization with zero or multiple Owners.

## Effective Access

When organization-level and team-level roles both apply, use the permission that grants the greatest applicable access:

1. Organization Owner
2. Organization Manager
3. Team Manager
4. Organization Viewer
5. Team Viewer
6. Team Athlete

An organization role applies to every team in that organization. A team role may grant additional access to its specific team, but it cannot reduce access granted at the organization level.

## Training Library Access

The organization training library is distinct from assigned workout access:

- Organization Owners and Managers can read and manage the shared exercise, workout, and plan library.
- Team Managers can read and manage the shared organization library, even when their organization role is Athlete or Viewer.
- Organization Viewers and Team Viewers can browse the library but cannot mutate it.
- Athlete-only users do not browse organization templates. They receive only assigned training through the athlete experience.
- A global library decision evaluates every team membership in the active organization. A role in another organization grants no access.

Library routes and every library mutation independently revalidate the active organization, current memberships, and requested resource ownership on the server. Exercise, workout, and plan identifiers supplied by clients never establish organization scope.

## Landing Resolution

`/app` dynamically selects the user's default destination within the active organization using the effective-access hierarchy:

| Effective access                                    | Default destination                |
| --------------------------------------------------- | ---------------------------------- |
| Organization Owner or Manager                       | Organization Performance Dashboard |
| Team Manager without organization management access | Managed Teams portfolio            |
| Organization Viewer                                 | Organization Performance Dashboard |
| Team Viewer with an Athlete organization role       | Viewed Teams portfolio             |
| Team Athlete or organization-only Athlete           | Athlete Dashboard                  |

Landing priority does not revoke access. It only chooses the most appropriate starting surface; every canonical route must still perform its own server-side authorization.

When a user belongs to multiple organizations, a validated active-organization preference selects the organization context. A missing, stale, or foreign preference requires organization selection and never establishes authorization by itself.

## Data Policy

- No role may export application data. All data must remain within the application.
- Every read and mutation must be authorized on the server.
- Tenant-owned data must be scoped to its organization.
- Team access must verify both the user's effective permissions and the team's organization.
- Client-provided organization, team, user, athlete, or role identifiers must never establish authorization by themselves.
- Ownership transfer and organization-member removal must be transactional.
- Removing organization access must remove dependent team access in the same transaction.

## Organization Timezone

- Each organization stores an IANA timezone identifier used for scheduling behavior.
- Organization timezone defaults to `UTC` when an organization is created.
- Only roles with `organization.update` permission (Owner and Manager) may update timezone settings.
- Timezone values must be validated server-side before persistence.

## Testing Expectations

Authorization tests should verify at least:

- Each role can perform only its allowed operations.
- Athletes cannot read or modify another athlete's results.
- Team roles do not grant access to other teams.
- Organization roles apply to all teams in the same organization.
- No membership grants access to another organization.
- Removing organization membership removes all dependent team memberships.
- Ownership transfer preserves exactly one Owner.
- No role can export data.
