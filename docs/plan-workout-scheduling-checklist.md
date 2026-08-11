# Plan Workout Scheduling and Athlete Logging Implementation Checklist

## Objective

Separate plan overview from workout logging and support two plan-workout scheduling modes:

- Fixed weekday, such as every Monday.
- Weekly frequency target, such as two sessions per week on athlete-selected days.

The athlete must be able to understand the full plan, see current-week progress, open a specific workout occurrence, record results, and complete that occurrence without affecting other workouts or weeks.

## Scope

- Plan authoring for fixed-day and weekly-frequency workout slots.
- Forward-safe migration of existing fixed-day plans.
- Immutable assignment snapshots of schedule rules and workout programming.
- Assignment-timezone occurrence resolution and weekly progress calculation.
- Plan-only athlete overview route.
- Dedicated athlete workout logging route.
- Occurrence-aware session start, save, reset, and completion.
- Tenant isolation, athlete ownership, and server-side schedule validation.
- Unit, integration, component, and route-level regression coverage.

## Product Decisions

### Scheduling Modes

Each plan workout slot uses exactly one scheduling mode:

1. `fixed_day`
   - Requires one weekday.
   - Does not accept a weekly frequency target.
   - Produces one workout occurrence on that weekday for every assignment-local week intersecting the assignment date range.

2. `weekly_frequency`
   - Requires a positive target number of sessions per week.
   - Does not accept a weekday.
   - Allows the athlete to choose the completion date within the active assignment-local week.

### Week Boundaries

- Weeks run Monday through Sunday.
- Week boundaries and date calculations use the assignment timezone.
- Only dates inside the assignment start and end dates are eligible.
- The configured weekly target remains unchanged in partial first and last weeks; version 1 will not prorate targets.
- Completed sessions do not carry over into another week.

### Flexible Workout Rules

- A flexible workout can be started on any eligible day in the current week.
- One occurrence of the same plan workout is allowed per calendar date.
- Athletes cannot start another occurrence after meeting the weekly target.
- Existing submitted occurrences remain viewable after the weekly target is met.
- Staff cannot retroactively move completed occurrences between weeks in this phase.

### Session Lifecycle

- No database session is created merely by viewing a plan or workout.
- An occurrence without a session is presented as assigned or available in the read model.
- Starting an occurrence creates an `in_progress` session.
- Saving metrics keeps it `in_progress`.
- Completing the session persists pending metrics and changes it to `submitted`.
- Reset is available only for non-submitted sessions and restores that occurrence to its initial state.
- Submitted sessions remain immutable through the athlete workflow.

### Navigation

- Plan overview:
  - `/app/athlete/assignments/[assignmentId]`
- Workout logging occurrence:
  - `/app/athlete/assignments/[assignmentId]/workouts/[workoutSnapshotId]/[scheduledDate]`
- Workout-only assignments may redirect their assignment detail route to their single workout occurrence.
- Route parameters are untrusted and must be authorized and validated server-side.

## Domain Terminology

- **Plan workout slot**: a workout template plus its fixed-day or weekly-frequency scheduling rule.
- **Workout snapshot**: immutable workout programming captured when an assignment is published.
- **Plan slot snapshot**: immutable scheduling metadata connecting a plan workout slot to its workout snapshot.
- **Workout occurrence**: one eligible dated instance of a plan workout within an assignment.
- **Session**: persisted athlete state for one workout occurrence.
- **Weekly progress**: submitted occurrences for one plan slot divided by its weekly target in one assignment-local week.

## Core Invariants

- A plan slot has exactly one scheduling mode.
- A fixed-day slot has a weekday and no weekly target.
- A weekly-frequency slot has a weekly target and no weekday.
- Weekly targets are positive and capped at a documented product maximum.
- Assignment snapshots preserve the schedule mode and values at publication time.
- Library plan edits never alter published assignment scheduling or workout programming.
- Every plan session references its plan slot snapshot and workout snapshot.
- Session `scheduledDate` is within the assignment date range.
- Fixed-day session dates match the snapshotted weekday.
- Flexible session dates belong to the active assignment-local week.
- Flexible submitted and in-progress sessions cannot exceed the weekly target.
- Every athlete read and mutation is scoped by organization, assignment recipient, athlete, workout snapshot, and occurrence date.
- An athlete cannot view or mutate another athlete's session.

## Priority Sequence

1. Lock schema and migration contract.
2. Update plan authoring and validation.
3. Snapshot scheduling metadata at publication.
4. Build occurrence and weekly-progress read models.
5. Split plan overview and workout logging routes.
6. Make session lifecycle occurrence-aware.
7. Complete flexible-frequency behavior.
8. Harden authorization, errors, and mobile UX.
9. Update documentation and run full verification.

## Milestone 1: Scheduling Schema and Migration

### Requirements

- Existing plans continue to behave as fixed-day plans.
- New plans can mix fixed-day and weekly-frequency slots.
- Invalid scheduling combinations are rejected by both Zod and PostgreSQL.
- Applied migrations are never rewritten.

### Implementation Checklist

- [x] Add a plan schedule type enum with `fixed_day` and `weekly_frequency`.
- [x] Add `scheduleType` to `plan_schedule_slots`.
- [x] Make `dayOfWeek` nullable.
- [x] Add nullable `targetSessionsPerWeek` integer.
- [x] Backfill all existing rows as `fixed_day`.
- [x] Add a database check requiring exactly one valid schedule configuration.
- [x] Add a positive and bounded weekly-target database check.
- [x] Review uniqueness constraints now that weekday is nullable.
- [x] Mirror scheduling fields on `assignment_plan_slot_snapshots`.
- [x] Backfill existing assignment snapshots as `fixed_day`.
- [x] Add matching snapshot database checks.
- [x] Update Drizzle inferred types and exports.
- [x] Add schema integration tests for valid and invalid combinations.

### Acceptance Criteria

- [x] Existing weekday plans load without manual repair.
- [x] Fixed-day rows cannot store a frequency target.
- [x] Frequency rows cannot store a weekday.
- [x] Zero, negative, and excessive weekly targets fail at the database boundary.
- [x] Assignment snapshots enforce the same scheduling invariants as library plans.

## Milestone 2: Plan Builder and Library Views

### Requirements

- Coaches select a schedule mode per workout slot.
- The builder reveals only controls relevant to the selected mode.
- Existing fixed-day plans edit without losing data.
- Read-only plan views clearly communicate each scheduling rule.

### Implementation Checklist

- [x] Replace the weekday-only plan-slot input with a discriminated Zod union.
- [x] Add a schedule-mode segmented control to each plan-builder row.
- [x] Show weekday selection for `fixed_day`.
- [x] Show a bounded numeric frequency control for `weekly_frequency`.
- [x] Preserve workout selection, label, and ordering behavior.
- [x] Update graph serialization and action parsing.
- [x] Update create, edit, duplicate, and repository mapping paths.
- [x] Update plan detail copy:
  - [x] `Every Monday` for fixed-day slots.
  - [x] `2 sessions per week` for flexible slots.
- [x] Update empty, validation, and disabled states.
- [x] Add builder component tests for changing modes without stale hidden values.
- [x] Update plan service and repository tests.

### Acceptance Criteria

- [x] A coach can create and edit a plan containing both scheduling modes.
- [x] Mode changes clear incompatible values before submission.
- [x] Invalid mixed-mode payloads are rejected server-side.
- [x] Duplicating a plan preserves every schedule rule.
- [x] Plan detail displays human-readable scheduling rules.

## Milestone 3: Assignment Snapshot Publication

### Requirements

- Publishing snapshots both workout programming and schedule rules.
- Snapshot output is deterministic and ordered.
- Later plan edits do not affect existing assignments.

### Implementation Checklist

- [x] Extend plan source selection to include schedule type and weekly target.
- [x] Persist all scheduling fields in assignment plan-slot snapshots.
- [x] Preserve slot label, position, source slot id, and workout snapshot relationship.
- [x] Remove publication assumptions that every plan slot has a weekday.
- [x] Ensure one workout snapshot remains associated with one snapshotted plan slot.
- [x] Add publication tests for mixed fixed and flexible plans.
- [x] Add regression coverage proving library edits do not mutate snapshots.
- [x] Add negative tests for malformed source scheduling data.

### Acceptance Criteria

- [x] Published mixed-mode plans preserve exact scheduling rules.
- [x] Snapshot ordering matches plan ordering.
- [x] Historical assignments remain unchanged after plan edits.
- [x] Publication remains transactional.

## Milestone 4: Occurrence and Weekly Progress Read Models

### Requirements

- Athlete views receive occurrence data rather than inferring schedules in React.
- Date and week calculations are deterministic and assignment-timezone aware.
- Progress distinguishes available, in-progress, submitted, upcoming, and unavailable occurrences.

### Implementation Checklist

- [x] Add a server-side assignment-local date utility.
- [x] Add Monday-Sunday week-boundary utilities with DST tests.
- [x] Add fixed-day occurrence generation for assignment date ranges.
- [x] Add flexible weekly-progress calculation by plan slot snapshot.
- [x] Return current-week target and completed count for flexible slots.
- [x] Return exact session state for dated occurrences.
- [x] Return the next actionable occurrence for overview emphasis.
- [x] Return completed occurrence history for each plan workout.
- [x] Ensure occurrence queries authorize the athlete recipient before returning data.
- [x] Avoid materializing future occurrence rows in the database until a session starts.
- [x] Add query integration tests across week and timezone boundaries.

### Acceptance Criteria

- [x] Fixed-day occurrences appear only on matching eligible dates.
- [x] Flexible progress resets at assignment-local Monday midnight.
- [x] Sessions around UTC midnight count toward the correct local week.
- [x] Partial first and last weeks remain bounded by assignment dates.
- [x] No cross-athlete or cross-organization occurrence data is returned.

## Milestone 5: Athlete Plan Overview

### Requirements

- The assignment detail page contains only plan-level information.
- Athletes can understand the complete schedule and current-week expectations.
- Every actionable workout is keyboard-accessible and opens its logging page.

### Implementation Checklist

- [ ] Remove exercise fields and logging actions from the plan overview route.
- [ ] Keep plan name, assignment dates, status, and return navigation.
- [ ] Add a current-week schedule section.
- [ ] Show fixed-day rows with weekday and full date.
- [ ] Show flexible rows with target and weekly progress.
- [ ] Show workout name, optional slot label, and occurrence status.
- [ ] Make the whole workout row a semantic link.
- [ ] Highlight the next actionable workout without relying on color alone.
- [ ] Show submitted occurrences as viewable, not actionable for edits.
- [ ] Add clear empty and assignment-complete states.
- [ ] Preserve useful canceled-assignment messaging and completed history.
- [ ] Verify mobile layout, keyboard focus, and accessible names.

### Acceptance Criteria

- [ ] No exercise metric inputs or session mutation buttons appear on the overview.
- [ ] Athletes can see all plan workouts and their scheduling rules.
- [ ] Athletes can see current-week progress for frequency targets.
- [ ] Clicking a row opens the correct workout snapshot and date.
- [ ] The overview remains useful after every current-week workout is submitted.

## Milestone 6: Dedicated Workout Logging Route

### Requirements

- Logging is scoped to one authorized workout occurrence.
- The page identifies the parent plan, workout, schedule rule, and occurrence date.
- Existing completion-first metric entry remains available.

### Implementation Checklist

- [ ] Add the nested workout occurrence route.
- [ ] Read promised route params using installed Next.js conventions.
- [ ] Load assignment, plan slot snapshot, workout snapshot, occurrence, and athlete session server-side.
- [ ] Query exercise items by the selected workout snapshot rather than the first snapshot.
- [ ] Add breadcrumb or back link to the plan overview.
- [ ] Show workout name, optional slot label, weekday/date, and session status.
- [ ] Move Start Workout to the logging page.
- [ ] Move exercise completion, actual metrics, notes, and Save Progress to the logging page.
- [ ] Move Complete Session and Reset Session to the logging page.
- [ ] Keep submitted sessions readable and immutable.
- [ ] Add loading, unavailable, not-found, canceled, and submitted states.
- [ ] Redirect workout-only assignments to their single logging occurrence when appropriate.

### Acceptance Criteria

- [ ] The route never displays items from another workout snapshot.
- [ ] A submitted occurrence remains readable from its original URL.
- [ ] Pending completion changes persist when Complete Session is used.
- [ ] Returning to the plan overview shows updated progress.
- [ ] Direct URL manipulation cannot access another athlete's occurrence.

## Milestone 7: Occurrence-Aware Session Lifecycle

### Requirements

- Session operations target an explicit occurrence.
- Starting one plan workout never reuses another workout's session.
- Optimistic versioning and mutation idempotency remain enforced.

### Implementation Checklist

- [ ] Replace primary-workout lookup in session start with explicit workout and plan-slot snapshot resolution.
- [ ] Require `workoutSnapshotId`, `planSlotSnapshotId`, and `scheduledDate` for plan session creation.
- [ ] Validate the plan slot belongs to the assignment and references the workout snapshot.
- [ ] Validate fixed-day occurrence dates against the snapshotted weekday.
- [ ] Validate flexible dates against assignment range and assignment-local current week.
- [ ] Persist `planSlotSnapshotId` on plan sessions.
- [ ] Replace latest-session lookup with exact occurrence lookup.
- [ ] Replace primary-workout item lookup with selected-workout item lookup.
- [ ] Preserve standalone workout assignment behavior with a null plan slot snapshot.
- [ ] Keep autosave item allow-list scoped to the session workout snapshot.
- [ ] Keep reset transactional and occurrence-scoped.
- [ ] Keep completion transactional and version-aware.
- [ ] Add service tests for stale versions, wrong slots, wrong dates, and wrong athletes.

### Acceptance Criteria

- [ ] Starting Workout 2 never returns Workout 1's session.
- [ ] Repeated weekly occurrences create distinct sessions on distinct dates.
- [ ] The same occurrence start is idempotent.
- [ ] Session results cannot reference exercises from another workout snapshot.
- [ ] Reset clears only the selected occurrence.

## Milestone 8: Weekly Frequency Enforcement

### Requirements

- Flexible workouts can be completed up to their weekly target.
- Progress and enforcement use the same server-side week calculation.
- Race conditions cannot create sessions beyond the target.

### Implementation Checklist

- [ ] Count existing in-progress and submitted flexible sessions for the plan slot and local week.
- [ ] Reject start when the weekly target is already met.
- [ ] Prevent duplicate same-date starts with existing session uniqueness.
- [ ] Add transaction-safe or constraint-backed protection against concurrent over-target starts.
- [ ] Define UI behavior for an abandoned in-progress occurrence.
- [ ] Show remaining sessions on overview and logging pages.
- [ ] Show target-met state with links to completed occurrences.
- [ ] Add concurrency and retry tests.
- [ ] Add week rollover tests.

### Acceptance Criteria

- [ ] A 2x/week workout permits two eligible occurrences and rejects a third.
- [ ] Concurrent starts cannot exceed the target.
- [ ] Monday begins a new target window in the assignment timezone.
- [ ] Prior-week sessions do not count toward the current week.

## Milestone 9: Dashboard, UX, and Failure States

### Requirements

- Athlete entry points clearly distinguish plan assignments from single workouts.
- Errors explain the blocked occurrence without leaking internal details.
- Mobile workflows remain efficient.

### Implementation Checklist

- [ ] Update athlete dashboard plan rows to link to plan overview.
- [ ] Keep workout-only rows linked to their logging occurrence.
- [ ] Show current-week completion summary on plan rows where practical.
- [ ] Replace generic session action errors with structured user-facing reasons.
- [ ] Add pending and disabled states for start, save, reset, and complete actions.
- [ ] Add confirmation for Reset Session where progress exists.
- [ ] Ensure destructive and completion controls are visually distinct.
- [ ] Verify focus order and touch target sizes on mobile.
- [ ] Verify labels do not rely on implementation terms such as snapshot or item.

### Acceptance Criteria

- [ ] Athletes can reach the correct plan or workout flow from the dashboard.
- [ ] Blocked schedule actions explain when the workout becomes available.
- [ ] No silent mutation failures remain in the occurrence workflow.
- [ ] Mobile viewport checks show no overlap or horizontal overflow.

## Migration and Compatibility Plan

- [x] Add a new forward-only Drizzle migration.
- [x] Add new nullable columns before enforcing new checks.
- [x] Backfill library slots and assignment snapshots as `fixed_day`.
- [x] Make weekday columns nullable only after backfill support is present.
- [x] Add schedule-type defaults only if they cannot mask malformed new writes.
- [x] Deploy code that can read migrated existing data.
- [x] Do not rewrite existing migrations.
- [x] Verify migration against an empty database and a database containing current plan assignments and sessions.
- [ ] Preserve existing submitted session URLs or add a deterministic redirect.

## Test Plan Checklist

### Unit

- [ ] Discriminated plan-slot input validation.
- [x] Week-boundary calculations in multiple timezones.
- [x] Fixed-day occurrence generation.
- [x] Flexible weekly-progress calculation.
- [ ] Session lifecycle schedule invariants.

### Component

- [x] Plan builder mode switching.
- [x] Fixed-day and frequency controls.
- [ ] Plan overview workout rows and statuses.
- [ ] Logging fields for editable and submitted sessions.

### Integration

- [x] Migration backfill and database checks.
- [x] Mixed-mode plan publication snapshots.
- [ ] Exact occurrence session start.
- [ ] Flexible target enforcement.
- [ ] Save, reset, and complete one occurrence without affecting another.
- [ ] Repeated workouts across separate weeks.

### Security and Tenant Isolation

- [ ] Cross-organization assignment occurrence reads fail.
- [ ] Cross-athlete session reads and writes fail.
- [ ] Foreign plan slot snapshot ids fail.
- [ ] Foreign workout snapshot ids fail.
- [ ] Client-supplied dates outside the assignment or scheduling rule fail.
- [ ] Client-supplied organization, athlete, and status values are ignored.

### Browser and Accessibility

- [ ] Plan overview desktop and mobile layouts.
- [ ] Keyboard navigation through clickable workout rows.
- [ ] Accessible names include workout and scheduled date or weekly target.
- [ ] Start, save, reset, and complete flow in the browser.
- [ ] Submitted occurrence read-only state.

## Documentation Updates

- [ ] Update `docs/app-functionality.md` terminology and athlete flow.
- [ ] Document fixed-day and weekly-frequency plan rules.
- [ ] Document Monday-Sunday assignment-timezone week boundaries.
- [ ] Document partial-week and no-carryover policies.
- [ ] Update any assignment architecture or operational documentation affected by route changes.

## Done Definition

- [ ] All milestone acceptance criteria are complete.
- [ ] Existing plan data is migrated safely.
- [ ] Plan overview and workout logging are separate routes.
- [ ] Fixed-day and weekly-frequency plans work end to end.
- [ ] Tenant isolation and athlete ownership tests pass.
- [ ] Regression tests cover standalone workout assignments.
- [ ] `npm run validate` passes.
- [ ] `npm run build` passes.
- [ ] Relevant documentation is updated.

## Suggested Execution Slices

1. [x] Slice A: Scheduling schema, migration, and database tests.
2. [x] Slice B: Plan input, builder, repository, and library views.
3. [x] Slice C: Assignment snapshot publication for both schedule modes.
4. [x] Slice D: Date utilities, occurrence read model, and progress queries.
5. [ ] Slice E: Plan-only athlete overview with clickable workouts.
6. [ ] Slice F: Dedicated workout logging route and selected-snapshot reads.
7. [ ] Slice G: Occurrence-aware session start, save, reset, and complete.
8. [ ] Slice H: Weekly target enforcement and concurrency protection.
9. [ ] Slice I: Dashboard integration, failure states, accessibility, and documentation.

## Explicitly Deferred

- Carrying missed sessions or surplus completions into another week.
- Prorating weekly targets for partial assignment weeks.
- Multiple occurrences of the same plan workout on one calendar date.
- Athlete rescheduling of fixed-day workouts.
- Staff editing or moving submitted occurrence dates.
- Calendar drag-and-drop scheduling.
- Deload, alternating-week, and multi-week microcycle rules.
- Automated reminders and notifications.
