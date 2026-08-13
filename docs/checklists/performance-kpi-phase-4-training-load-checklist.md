# Performance KPI Phase 4: Training Load Checklist

## Objective

Extend the compliance and timeliness foundation with trustworthy training-load capture and individual-context reporting. Phase 4 must help staff understand recorded work and athlete response without presenting training load as a diagnosis, readiness score, or universal injury-risk threshold.

Phase 4 must answer:

1. What internal and external work did an athlete record for a completed session?
2. How does completed work compare with the assigned prescription when both are measurable?
3. How does the athlete's recent work compare with their own rolling history?

Reference foundation and rationale:

- [performance-kpi-implementation-checklist.md](performance-kpi-implementation-checklist.md)
- [performance-kpi-phase-2-timeliness-trends-checklist.md](performance-kpi-phase-2-timeliness-trends-checklist.md)
- [performance-kpi-recommendations.md](../performance-kpi-recommendations.md)

## Scope

### Included

- Session-level duration and session RPE captured from the athlete.
- Derived internal load from completed session duration and RPE.
- Structured strength-load values and units for new prescriptions and results.
- Canonical kilogram normalization and measurable strength-volume calculations.
- Athlete-specific prescription overrides layered over shared assignment workout snapshots.
- Completed-versus-prescribed comparisons when both sides are measurable.
- Individual rolling baselines and explicit insufficient-history states.
- Athlete, assignment, team, and organization read models that preserve existing authorization and tenant boundaries.
- Staff-facing load summaries and athlete-owned session review.
- Forward-safe schema migration, compatibility for free-text historical loads, and behavior-focused test coverage.

### Deferred

- Medical, readiness, injury-risk, fatigue, or return-to-play determinations.
- Universal red/yellow/green thresholds, peer ranking, or automatic intervention recommendations.
- Athlete-to-athlete comparisons and organization-level athlete rankings.
- GPS, heart-rate, bar-velocity, wearable, or third-party telemetry integrations.
- Exercise-form scoring, video review, attendance, wellness, sleep, or availability data.
- Automatic one-repetition-max estimates and percentage-of-1RM prescriptions.
- Multi-set progression redesign beyond the existing result-row model.
- Replacing or attempting to parse historical free-text `load` values.
- Editing the shared workout or assignment snapshot to individualize one athlete's prescription.
- Applying an athlete-specific override retroactively to a started or submitted session.

## Approved Product Policy

### Capture and Ownership Rules

- Capture duration and RPE once per assignment session, not per exercise result.
- Let athletes provide duration in whole minutes and session RPE on the CR10 integer scale from 1 through 10.
- Permit either field to be omitted; a completed session remains valid without load data.
- Allow athletes to edit their own session load values only through the existing explicit completed-session edit path.
- Preserve the existing session submission timestamp and timeliness classification when load values are edited.
- Derive internal load from the stored values; do not accept an internal-load value from the client.
- Display the athlete's own data on athlete routes and preserve current staff role and publish-time team-scope rules on performance routes.
- Treat all load data as performance information, not medical information; do not introduce medical visibility rules in this phase.

### Individual Prescription Rules

- Treat assignment workout snapshots as the shared base prescription for every recipient; never change the source workout or shared snapshot to individualize one athlete.
- Allow authorized coaches to override prescribed reps, measurable load, exercise-level duration, distance, rest, tempo, and notes for one athlete and one assignment workout item.
- Scope each override by organization, assignment recipient, athlete, assignment workout item snapshot, and optional plan-slot snapshot; validate every ownership link on the server.
- Allow an override only for a current or future unstarted occurrence. An override must not alter a session that is already in progress or submitted.
- Resolve the effective prescription by applying the athlete-specific override to the shared snapshot for a future unstarted occurrence.
- Persist the resolved effective prescription when a session is started so a later override, source-workout edit, or roster change cannot rewrite what that athlete was assigned.
- Let a coach replace or clear an override for later unstarted occurrences; retain an auditable actor, timestamp, and optional reason for every change.
- Do not allow athletes to create, edit, or clear their own prescription overrides in this phase.
- Show athletes only their effective prescription, without exposing the shared base prescription or staff-only override history.

### Unit and Normalization Rules

- Keep historical free-text prescription and result loads readable but unmeasurable.
- Require an explicit numeric value and unit (`kg` or `lb`) for a new measurable strength load.
- Normalize every new measurable strength load to kilograms at the server boundary using the exact conversion $1\ \mathrm{lb} = 0.45359237\ \mathrm{kg}$.
- Retain the entered numeric value and unit for athlete-facing display; use normalized kilograms only for aggregation and comparison.
- Do not coerce bodyweight, bands, percentages, RPE-based loads, or arbitrary text into a numeric strength load.
- Calculate completed strength volume only for result rows with both integer reps and normalized kilograms.
- Calculate prescribed strength volume only for snapshot rows with both prescribed reps and normalized kilograms.
- Keep distance and exercise-level duration as separate external-work measures; do not add them to strength volume.

### Baseline and Presentation Rules

- Calculate internal load only for submitted sessions with both duration and session RPE.
- Define internal load as:

```text
internalLoad = durationMinutes * sessionRpe
```

- Define measurable strength volume as:

```text
strengthVolumeKg = sum(reps * normalizedLoadKg)
```

- Define prescription completion only when the compared session has measurable prescribed and completed volume:

```text
strengthVolumeCompletion = completedStrengthVolumeKg / prescribedStrengthVolumeKg
```

- Use the athlete's preceding 28 completed calendar days in the assignment timezone as the initial baseline window.
- Exclude the current session from its own baseline and require at least three eligible prior sessions before displaying a baseline comparison.
- Report the baseline as descriptive context, such as current internal load, 28-day individual median, and percentage difference; do not label a value safe, unsafe, high risk, or low risk.
- Return structured unavailable reasons including `missing_duration`, `missing_rpe`, `unmeasurable_external_work`, and `insufficient_history` rather than substituting zero or a universal threshold.
- Aggregate team and organization values from raw session facts; never average athlete percentages or baselines.

### Historical and Migration Rules

- Preserve existing assignments, session results, and free-text loads without attempted parsing or mutation.
- Add new nullable fields so historical completed sessions remain readable and valid.
- Snapshot normalized prescription fields at assignment publication so later workout edits cannot change historical comparisons.
- Snapshot the effective athlete-specific prescription when its session starts so later override edits cannot change historical comparisons.
- Store enough source values and conversion data to reproduce a displayed metric after application defaults change.
- Use a forward-only migration and tenant-aware indexes; never rewrite an applied migration.

## Core Metric Contract

### Session Load States

- [ ] `notCaptured`: submitted session is missing duration or session RPE.
- [ ] `internalLoadAvailable`: submitted session has valid duration and session RPE.
- [ ] `externalWorkUnavailable`: no comparable measurable result rows exist.
- [ ] `externalWorkPartial`: some, but not all, prescribed or completed result rows are measurable.
- [ ] `externalWorkComparable`: prescribed and completed measurable strength volume are both available.
- [ ] Keep lifecycle compliance and timeliness states independent from load-capture state.

### Formulas

- [ ] Define `internalLoad = durationMinutes * sessionRpe` at the application layer.
- [ ] Define completed and prescribed strength volume from normalized kilograms only.
- [ ] Define volume completion only when both volumes are greater than zero.
- [ ] Preserve raw duration, RPE, kilograms, reps, and sample counts beside every derived metric.
- [ ] Return `null`, not `0`, for unavailable or unmeasurable metrics.
- [ ] Keep partial external work visibly distinct from fully comparable external work.
- [ ] Aggregate organization and team totals from raw duration, internal-load, and volume facts.

### Baseline Formulas

- [ ] Select only submitted, internal-load-eligible sessions in the 28 calendar days preceding the current session's scheduled date.
- [ ] Use the assignment timezone for calendar-window boundaries.
- [ ] Define `individualMedianInternalLoad` as the median of eligible preceding session internal loads.
- [ ] Define `internalLoadDifference = currentInternalLoad - individualMedianInternalLoad`.
- [ ] Define `internalLoadDifferencePercent = internalLoadDifference / individualMedianInternalLoad` only when the baseline is greater than zero.
- [ ] Require at least three preceding eligible sessions before returning baseline values.
- [ ] Do not turn a baseline difference into a risk level, alert color, or prescribed staff action.

## Priority Sequence

1. Lock the capture, unit, override, historical, and baseline contracts.
2. Add forward-safe override and effective-session prescription snapshot storage.
3. Validate and persist athlete-entered duration, RPE, and structured strength loads.
4. Build pure normalization, effective-prescription, comparison, and individual-baseline domain functions.
5. Extend authorized session, assignment, team, and organization read models.
6. Add coach prescription adjustment, athlete logging, and staff drill-down presentation.
7. Complete migration, tenant-isolation, accessibility, browser, and repository verification.

## Milestone 1: Policy Contract and Data Model

### Requirements

Persist the entered values and immutable assignment prescription facts required to reproduce a load metric without breaking legacy session history.

### Implementation Checklist

- [x] Add nullable whole-minute duration and CR10 RPE columns to `assignment_sessions`.
- [x] Add nullable numeric entered load, unit, and normalized-kilogram columns to workout-item definitions and assignment item snapshots.
- [x] Add nullable numeric entered load, unit, and normalized-kilogram columns to assignment session item results.
- [x] Add an athlete-specific assignment-item override table keyed by organization, assignment recipient, athlete, item snapshot, and applicable plan slot when required.
- [x] Store overridden prescription fields, normalized load fields, change actor, timestamps, optional reason, and a version for optimistic concurrency.
- [x] Add an immutable per-session effective-item-prescription snapshot created when a session starts.
- [x] Keep effective-session prescription snapshots separate from athlete-entered result rows.
- [ ] Preserve existing text load columns for legacy display and non-measurable entries.
- [x] Add database checks for nonnegative duration, RPE range 1 through 10, positive numeric loads, and supported units.
- [x] Add database checks requiring entered numeric load, unit, and normalized kilograms to be present together.
- [x] Add indexes for organization-scoped submitted-session date reads and athlete-scoped baseline reads.
- [x] Add indexes supporting recipient-scoped effective-prescription resolution and session-start snapshot creation.
- [x] Keep all tenant-owned columns, indexes, and repository queries organization-aware.
- [x] Update Drizzle inferred types, snapshot records, and repository input/output types.
- [x] Create a forward-only Drizzle migration without modifying existing migrations.

### Migration and Compatibility

- [x] Apply new columns as nullable with no destructive rewrite of historical result values.
- [x] Leave historical free-text loads unnormalized and unavailable for volume aggregation.
- [x] Backfill no inferred duration, RPE, or numeric load data.
- [ ] Verify existing assignment publication can create snapshots without measurable load values.
- [ ] Verify a shared assignment item can have distinct valid overrides for separate recipients without changing the shared snapshot.
- [ ] Verify existing completed sessions remain editable according to current authorization rules.
- [ ] Add schema integration coverage for constraints, null legacy rows, and valid normalized rows.

### Acceptance Criteria

- [ ] Historical data remains readable without fabricated load metrics.
- [ ] A persisted assignment snapshot reproduces its measurable prescription after its source workout changes.
- [ ] A session's effective prescription remains reproducible after its athlete-specific override changes or is cleared.
- [ ] No new load field can cross organization, assignment, or session ownership boundaries.

## Milestone 2: Individual Prescription Overrides

### Requirements

Allow authorized coaches to adapt a shared assignment for an individual athlete without creating a duplicate workout or changing another recipient's prescription.

### Implementation Checklist

- [ ] Add a server-side override command with Zod validation for each permitted prescription field.
- [ ] Authorize every override write against the active organization, managed team scope, assignment, recipient, athlete, item snapshot, and plan slot.
- [ ] Reject overrides for canceled assignments and unknown or mismatched recipient/item/slot identities.
- [ ] Reject edits to occurrences with an in-progress or submitted session; guide staff to create a future-occurrence override instead.
- [ ] Resolve the effective prescription in one module-owned application function with explicit field precedence: override value, then shared item snapshot value.
- [ ] Normalize structured override loads on the server and keep free-text overrides unmeasurable.
- [ ] Create or replace an override atomically with its audit metadata and optimistic-concurrency version.
- [ ] Support clearing an override so future unstarted occurrences return to the shared snapshot.
- [ ] Create per-session effective prescription snapshots atomically with session start before any athlete result can be saved.
- [ ] Keep effective snapshots unchanged during autosave, submit, reset, and completed-session result edits.
- [ ] Revalidate affected coach and athlete routes after an override changes.

### Coach Workflow

- [ ] Add an athlete-specific prescription action from an authorized assignment or athlete drill-down, not from the shared workout library editor.
- [ ] Show the shared base prescription and the athlete's effective prescription together only to authorized staff.
- [ ] Use appropriate controls for reps, numeric load and unit, duration, distance, rest, tempo, and notes.
- [ ] Clearly identify which fields are individualized and which continue to inherit the shared assignment snapshot.
- [ ] Let a coach clear one field or the complete override with a confirmation appropriate to the affected future occurrences.
- [ ] Show an explicit locked state for started and completed occurrences, including the effective prescription used.
- [ ] Preserve keyboard access, useful field labels, error messages, visible focus, and mobile layout behavior.

### Tests

- [ ] An authorized coach can set a 135 lb, 10-rep base item to 20 reps or a different load for one athlete only.
- [ ] A second athlete assigned the same workout retains the shared base prescription.
- [ ] The athlete sees only the resulting effective prescription.
- [ ] Starting a session snapshots the effective prescription before athlete results are saved.
- [ ] Replacing or clearing an override changes only later unstarted occurrences.
- [ ] Started and submitted sessions retain their original effective prescription after a later override change.
- [ ] Athlete, Viewer, unmanaged Team Manager, foreign organization, and foreign team attempts to change an override fail safely.
- [ ] Concurrent coach edits enforce optimistic concurrency and return an actionable conflict.

### Acceptance Criteria

- [ ] Coaches can individualize an athlete's prescription without cloning a workout or affecting any other athlete.
- [ ] Each prescribed-versus-completed comparison uses the immutable prescription actually presented for that session.
- [ ] The override path preserves tenant isolation, publish-time scope, and existing session lifecycle invariants.

## Milestone 3: Input Validation and Session Capture

### Requirements

Capture athlete-entered session response and measurable external work through the existing offline-safe session workflow.

### Implementation Checklist

- [ ] Extend server-side Zod input schemas for duration, session RPE, numeric load, and unit.
- [ ] Reject non-finite values, unsupported units, out-of-range RPE, and incompatible value/unit combinations.
- [ ] Normalize numeric strength loads to kilograms on the server; never trust client-provided normalized values.
- [ ] Extend session FormData parsing while preserving absent values as `null`.
- [ ] Extend autosave and submit mutations without weakening version checks or idempotency behavior.
- [ ] Keep athletes limited to their own organization-scoped assignment sessions and result rows.
- [ ] Allow a submitted-session edit to update load data without changing first submission time.
- [ ] Return structured, actionable validation errors at the existing session form boundary.
- [ ] Do not require load capture to start, save, or submit a session.

### Athlete Workflow

- [ ] Add compact session-level duration and RPE controls near session completion, with labels and validation messages.
- [ ] Use a numeric input with clear units for duration and a bounded stepper or segmented control for RPE.
- [ ] Render numeric-load and unit controls only where a measurable load is appropriate.
- [ ] Preserve free-text logging for non-measurable loads such as bodyweight, bands, and percentages.
- [ ] Show entered values after autosave, refresh, and explicit completed-session edit.
- [ ] Provide explicit empty and disabled states without blocking unrelated exercise-result logging.
- [ ] Preserve keyboard access, visible focus, mobile usability, and offline-safe mutation behavior.

### Tests

- [ ] Valid duration and RPE persist through autosave and submission.
- [ ] Omitted duration or RPE leaves internal load unavailable rather than zero.
- [ ] Invalid RPE, duration, load value, or unit is rejected at the server boundary.
- [ ] A numeric pound result normalizes to the expected kilograms value.
- [ ] A submitted-session edit preserves first submission time and timeliness state.
- [ ] A retry with the same mutation ID remains idempotent for load values.
- [ ] An athlete cannot mutate another athlete's session load values.

### Acceptance Criteria

- [ ] Athlete-entered session response and measurable result data survive the normal save, submit, reload, and edit workflow.
- [ ] The server, not the browser, owns validation and unit conversion.
- [ ] Existing session mutations remain backward compatible when no load values are supplied.

## Milestone 4: Shared Training-Load Domain

### Requirements

Build pure, reusable load calculations outside pages, components, and database queries.

### Implementation Checklist

- [ ] Add typed value objects for duration, session RPE, load unit, entered load, and normalized kilograms.
- [ ] Add a pure pounds-to-kilograms converter using the approved exact conversion.
- [ ] Add a pure effective-prescription resolver that applies athlete overrides without mutating shared snapshots.
- [ ] Add a pure internal-load calculator.
- [ ] Add pure prescribed and completed strength-volume calculators.
- [ ] Add a pure comparison builder that distinguishes unavailable, partial, and comparable external work.
- [ ] Add a pure individual rolling-baseline builder using ordered eligible sessions.
- [ ] Return structured unavailable reasons and sample counts from every derived metric.
- [ ] Keep compliance, timeliness, and load calculations independently testable and composable.
- [ ] Avoid metric formulas in route files, React components, and SQL string formatting.

### Unit Tests

- [ ] Kilogram loads remain unchanged during normalization.
- [ ] Pound loads normalize with the approved conversion.
- [ ] Missing or invalid load parts produce unavailable external volume.
- [ ] Internal load multiplies only valid duration and RPE values.
- [ ] A result with reps and normalized kilograms contributes expected strength volume.
- [ ] Free-text, bodyweight, and percentage entries do not contribute fabricated strength volume.
- [ ] Partial measurable results remain distinct from fully comparable prescription/result sets.
- [ ] Three eligible prior sessions produce an individual median baseline.
- [ ] Fewer than three prior eligible sessions return `insufficient_history`.
- [ ] Current session is excluded from its own baseline.
- [ ] Timezone and calendar boundaries select the correct preceding 28-day sessions.

### Acceptance Criteria

- [ ] No UI or query layer independently calculates internal load, volume, or baseline percentages.
- [ ] Every displayed derived value can be reconstructed from visible raw values and documented formulas.
- [ ] Missing data is not represented as zero work or a negative performance signal.

## Milestone 5: Authorized Load Read Models

### Requirements

Expose load facts and comparisons through module-owned, tenant-aware reads without introducing N+1 behavior or leaking athlete data.

### Implementation Checklist

- [ ] Extend athlete session detail reads with duration, RPE, internal load, external-work comparison, and baseline context.
- [ ] Resolve future athlete workout reads from the effective prescription and started/submitted session reads from their immutable effective snapshot.
- [ ] Extend staff session-result detail reads with structured load values and comparable-volume fields.
- [ ] Extend authorized coach assignment and athlete reads with base prescription, effective prescription, and override state for future occurrences.
- [ ] Add an athlete assignment load summary scoped to submitted sessions in the selected window.
- [ ] Add team and organization load summaries from raw authorized session facts.
- [ ] Preserve publish-time recipient-to-team scope for team reporting.
- [ ] Include direct-athlete assignments in organization totals but not team rows without a persisted team scope.
- [ ] Deduplicate athlete-level baseline subjects in organization counts without summing athlete percentages.
- [ ] Use one request-level `asOf` instant and assignment timezone boundaries for rolling calculations.
- [ ] Keep missing capture, partial work, and insufficient history counts visible beside aggregate values.
- [ ] Avoid loading foreign organization or unauthorized team records before application-level aggregation.
- [ ] Validate query plans and add indexes only for demonstrated access patterns.

### Integration Tests

- [ ] Athlete, assignment, team, and organization totals reconcile from the same raw session facts.
- [ ] Team volume and internal load aggregate raw normalized values rather than child percentages.
- [ ] Historical free-text loads do not enter measurable totals.
- [ ] Partial and unavailable sessions remain distinguishable in summaries.
- [ ] Removed team members remain represented only through permitted publish-time history.
- [ ] Direct-athlete assignment behavior follows the documented organization-only rule.
- [ ] Foreign organizations and foreign teams cannot influence load summaries or baselines.
- [ ] Team Viewer can read allowed staff load detail but cannot mutate sessions.

### Acceptance Criteria

- [ ] All load reporting uses authorized, tenant-scoped module queries.
- [ ] Team and organization summaries are mathematically explainable through athlete and session facts.
- [ ] No aggregate implies that unmeasurable historical text loads are zero.

## Milestone 6: Athlete and Staff Presentation

### Requirements

Show the athlete's recorded response and staff-facing comparison context without diagnostic language or misleading visual thresholds.

### Athlete Experience

- [ ] Show session duration, RPE, and internal load after they are captured.
- [ ] Explain internal load as duration multiplied by session RPE.
- [ ] Show measurable completed and prescribed strength volume only when the comparison is available.
- [ ] Explain unavailable or partial external work in factual, non-punitive language.
- [ ] Do not expose team, peer, organization, or staff-only baseline comparisons to athletes.
- [ ] Keep the existing workout completion and result-edit flows primary.

### Staff Drill-Down

- [ ] Let authorized staff navigate from an athlete's assignment detail to their future prescription overrides.
- [ ] Add duration, RPE, internal load, and measurable-volume comparison to the submitted session review.
- [ ] Show raw values, normalized units, comparison denominator, and missing-data context.
- [ ] Add the athlete's individual 28-day baseline only when the minimum sample exists.
- [ ] Present current load, individual median, percentage difference, baseline sample count, and window dates together.
- [ ] Use neutral text and descriptive differences rather than risk labels or traffic-light thresholds.
- [ ] Preserve existing comments, result rows, selected-window context, and read-only Viewer access.

### Team and Organization Presentation

- [ ] Add load capture coverage before aggregate load totals so staff can see representativeness.
- [ ] Show aggregate internal load and measurable strength volume with session counts, not unexplained averages.
- [ ] Keep compliance and overdue-action surfaces ahead of descriptive load context.
- [ ] Provide assignment and athlete drill-down links for every aggregate.
- [ ] Avoid ranking athletes, publishing peer comparisons, or surfacing universal-threshold alerts.

### Accessibility and Responsive UX

- [ ] Use semantic labels and descriptions for duration, RPE, units, derived values, missing-data states, and baseline samples.
- [ ] Ensure keyboard operation of all numeric and RPE controls.
- [ ] Ensure screen readers announce value, unit, source, and unavailable reason together.
- [ ] Verify mobile layouts do not truncate values, units, formulas, names, or comparison fractions.
- [ ] Do not rely on color alone to indicate partial capture or individual-baseline differences.

### Acceptance Criteria

- [ ] An athlete can understand and correct their own captured session response.
- [ ] Staff can explain a displayed load value from raw session facts and its documented formula.
- [ ] No screen implies a diagnosis, universal risk threshold, or peer-performance ranking.

## Milestone 7: Verification and Rollout

### Unit and Integration

- [ ] Normalization, internal-load, volume-comparison, and baseline unit tests pass.
- [ ] Schema, migration, session mutation, authorized-read-model, and tenant-isolation integration tests pass.
- [ ] Existing compliance, timeliness, and offline-safe session tests retain their current behavior.
- [ ] Free-text historical load fixtures remain unmeasurable and readable.

### Browser / E2E

- [ ] Athlete logs duration and RPE, saves, reloads, and submits a session.
- [ ] Athlete logs a measurable pound and kilogram strength result and sees the entered units retained.
- [ ] Athlete logs a non-measurable free-text load without a fabricated volume metric.
- [ ] Coach individualizes one athlete's future prescription while another recipient keeps the shared prescription.
- [ ] Athlete begins a session with the individualized prescription, and the staff review shows that immutable effective prescription.
- [ ] Coach changes an override after session completion without altering the completed-session comparison.
- [ ] Athlete edits completed load data without changing original completion and timeliness facts.
- [ ] Coach sees the authorized session load facts and an available prescription comparison.
- [ ] Coach sees an explicit partial or unavailable state when values are missing.
- [ ] Coach sees an individual baseline only after the required prior-session sample exists.
- [ ] Athlete cannot access another athlete's load data or staff-only aggregate routes.
- [ ] Team Viewer remains read-only and unauthorized users receive no load details.
- [ ] Foreign-team and foreign-organization routes do not leak load values, baselines, or counts.

### Migration and Operational Verification

- [ ] Apply the migration against an empty database.
- [ ] Apply the migration against a representative database with free-text legacy loads.
- [ ] Verify rollback readiness through a documented forward remediation plan; do not depend on destructive down migrations.
- [ ] Confirm database indexes support representative athlete baseline and staff summary query plans.
- [ ] Confirm all new fields are absent from application logs and error payloads unless explicitly sanitized.

### Required Repository Checks

- [ ] `npm run validate` passes.
- [ ] `npm run build` passes.
- [ ] Focused unit, integration, component, and E2E tests cover every new load contract.
- [ ] Product documentation reflects final formulas, unit rules, missing-data behavior, and visibility boundaries.

### Rollout

- [ ] Release capture fields before treating load summaries as representative.
- [ ] Monitor duration, RPE, and structured-load capture coverage separately from compliance.
- [ ] Confirm coaches understand that baseline differences are descriptive, not risk classifications.
- [ ] Confirm athletes understand session RPE and duration entry expectations.
- [ ] Review unit adoption and missing-data patterns before broadening external-work metrics.
- [ ] Do not introduce configurable thresholds until real usage establishes a stable, auditable intervention policy.

## Phase 4 Done Definition

- [ ] Session duration and RPE are captured, validated, and editable through authorized session workflows.
- [ ] Internal load is derived from trusted stored values and never client-supplied.
- [ ] New measurable strength loads use canonical units while legacy free text remains intact.
- [ ] Prescribed and completed measurable work can be compared without treating missing values as zero.
- [ ] Individual 28-day baselines require sufficient prior data and use no universal thresholds.
- [ ] Athlete, assignment, team, and organization data remain tenant-scoped and authorization-safe.
- [ ] Staff can drill down from aggregate values to athlete and submitted-session facts.
- [ ] Unit, integration, E2E, accessibility, visual, migration, `npm run validate`, and `npm run build` checks pass.
