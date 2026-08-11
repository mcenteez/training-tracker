# Training Tracker Application Functionality

## Purpose

Training Tracker is a multi-tenant SaaS platform for strength and conditioning programs. It supports directors, coaches, and athletes with organization management, team operations, workout delivery, and athlete result tracking.

This document is a high-level functional reference for human contributors and AI agents.

## Primary Personas

- **Organization Owner**: full organization control, governance, and member administration.
- **Organization Manager**: day-to-day operational management across teams and athletes.
- **Team Manager**: manages assigned teams, athletes, and team-scoped training workflows.
- **Viewer**: read-only access to approved organization/team data.
- **Athlete**: mobile-first participant workflow for assigned training and personal progress.

## Core Domain Areas

### 1) Identity, Membership, and Access

- Users can belong to multiple organizations.
- Organizations contain teams and memberships.
- Team memberships are scoped to a team within an organization.
- Authorization is role-based and enforced server-side for every read and write.
- Tenant isolation is mandatory: organization-owned data cannot leak across organizations.

Reference: [access-control.md](access-control.md)

### 2) Organization Management

- Create and manage organizations.
- Maintain exactly one organization owner at all times.
- Transfer ownership transactionally.
- Manage organization members and roles.
- Remove organization members and dependent access safely.
- Configure organization timezone used for scheduling and assignment delivery.
- Operational management actions are centralized in a dedicated admin interface.

### 2.1) Performance Dashboard And Admin Split

- `/app` dispatches each user to the highest applicable organization, team, or athlete landing surface.
- `/app/performance/organization` is the read-focused organization Performance Dashboard for Owners, Managers, and Organization Viewers.
- `/app/performance/teams` is a portfolio of managed teams, or viewed teams when the user manages none.
- `/app/performance/teams/[teamId]` is the canonical team Performance Dashboard and independently enforces team and organization scope.
- `/app/athlete` focuses athletes on their teams and assigned workouts.
- `/app/organizations` lets multi-organization users choose an active organization; the saved preference is always revalidated against membership.
- Only owners and managers can access the admin interface for operational changes.
- Admin is a secondary destination and is never selected as the default landing page.

### 3) Team Management

- Create, update, and archive/delete teams (per policy and authorization).
- Assign and manage team members with team roles.
- Ensure team access remains scoped to the parent organization.

### 4) Athlete Management

- Maintain athlete identities and memberships.
- Support athletes with organization-only membership (not required to be on a team).
- Enable staff to place athletes on one or more teams as needed.

### 5) Exercise and Workout Library

- The training library is a standalone operational surface at `/app/library`, separate from organization Admin and read-focused Performance dashboards.
- Trainers create and manage reusable exercises at the organization level with a name, coaching instructions, category, equipment, and optional demonstration video URL.
- An exercise can be reused across any number of workouts in that organization.
- Trainers create and manage reusable workouts at the organization level.
- A workout is composed of ordered straight-set, circuit, or superset blocks. Each block contains ordered exercises with programming such as rounds, reps, load, duration, distance, rest, tempo, and coaching notes.
- Incomplete workouts may be saved as drafts. Activation requires at least one populated block and valid active exercises from the same organization.
- Exercises and workouts are archived and restored rather than hard-deleted through the application.
- Workouts can be duplicated into independent drafts while retaining source-template provenance.
- Concurrent edits use optimistic versions so a stale editor cannot silently overwrite newer programming.

### 5.1) Library Terminology and Usage

- **Exercise**: a reusable movement definition with coaching cues, category, equipment, and optional video.
- **Workout**: a single session template that defines one training session an athlete should complete.
- **Training Block**: an ordered grouping inside one workout (straight sets, circuit, or superset) used to structure that session.
- **Plan**: a multi-session schedule that organizes workout templates across a repeatable cadence (for example, a weekly Push/Pull/Legs cycle).
- **Plan workout slot**: one workout in a plan plus its scheduling rule. A slot is either fixed-day (every Monday) or weekly-frequency (2 sessions per week on athlete-selected days).
- **Workout occurrence**: one dated instance of a plan workout inside a published assignment. Athletes log results against occurrences.
- **Assignment**: a future delivery object that publishes a plan or workout to athletes while preserving snapshot history.
- Coaches should model one day/session per workout, use blocks to structure work within that session, and use plans to control when sessions occur over time.

### 6) Workout Assignment

- A plan will be the default assignment target for recurring training schedules.
- Workout-only assignment remains available for one-off sessions when a full multi-session schedule is unnecessary.
- When assigning training, managers select existing library templates first (plans or workouts), then create new templates only when needed.
- After assignment, coaches/trainers can customize by forking from existing library templates to preserve reuse.
- Assignment workflows should preserve library reuse (reuse first, create when needed).
- Control assignment visibility and availability windows.
- Assignments must snapshot plan/workout programming so later library edits or archival cannot change historical or in-progress prescriptions.
- Plan slots snapshot their scheduling rule (fixed weekday or weekly target) at publication; later plan edits never change published schedules.
- Weeks run Monday through Sunday in the assignment timezone. Weekly targets do not prorate in partial first/last weeks and completed sessions never carry between weeks.
- Fixed-day workouts produce one occurrence per matching weekday inside the assignment date range. Flexible workouts allow one occurrence per calendar date, up to the weekly target.

### 7) Results and Progress Tracking

- Athletes can record and update their own results.
- Staff can review results based on scope and role.
- Staff with assignment-management scope can append operational comments to submitted athlete results.
- Athletes must not access other athletes' private result data.

### 8) Compliance and Audit-Safe Operations

- Server-side authorization for all mutations.
- Transactional handling for critical membership and ownership operations.
- Explicit error handling for authorization, invariants, and missing resources.

## Key Functional Rules

- One role per user per organization.
- One role per user per team.
- Team role can add access for that team only; it never reduces organization-level access.
- Organization role applies across all teams in that organization.
- Exercises are organization-scoped library entities and are reusable across workouts.
- Workouts are organization-scoped library entities and are reusable across athlete assignments.
- Workout assignment should use organization library workouts (existing or newly created) rather than one-off unmanaged definitions.
- Workout customization follows a template-and-fork model: customizing from an existing library workout creates a new library workout.
- Removing organization membership removes dependent team memberships.
- Ownership transfer must preserve exactly one owner.

## Typical User Flows

### Staff Flow

1. Join or create organization.
2. Create teams.
3. Add athletes and staff memberships.
4. Create and maintain exercise and workout libraries.
5. Assign workouts to athletes by selecting an existing organization workout or creating a new one and assigning it.
6. Customize assigned workouts when needed by forking from an existing library workout template and saving as a new library workout.
7. Monitor athlete submissions and progress.

### Athlete Flow

1. Join organization/team via membership.
2. Open a plan assignment to see its schedule: fixed-day workouts with dates, flexible workouts with weekly progress.
3. Open a workout occurrence to start it, record completion and actual metrics, and complete or reset the session.
4. Review own progress history, including completed occurrences from previous weeks.

## Non-Functional Product Expectations

- **Mobile-first athlete UX**.
- **Accessible administrative and athlete experiences** (keyboard and screen-reader friendly).
- **Reliability and data integrity** for all membership and role transitions.
- **Tenant-safe defaults** in all data access paths.

## Implementation Status Note

This document describes the intended product functionality and operating model. Some areas may be partially implemented in the current codebase and should be treated as roadmap-aligned targets when building upcoming features.
