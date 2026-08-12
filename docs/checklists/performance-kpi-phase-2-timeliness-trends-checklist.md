# Performance KPI Phase 2: Timeliness and Trends Checklist

## Objective

Extend the Phase 1 compliance foundation with trustworthy occurrence deadlines, on-time completion metrics, lateness context, and equivalent-window trends.

Phase 2 must answer:

1. Was due training logged on time?
2. Is compliance improving, declining, or unchanged versus an equivalent previous window?
3. Which teams, assignments, athletes, and occurrences explain the change?

Reference foundation and rationale:

- [performance-kpi-implementation-checklist.md](performance-kpi-implementation-checklist.md)
- [performance-kpi-recommendations.md](../performance-kpi-recommendations.md)

## Scope

### Included

- Immutable assignment-level timeliness policy snapshots.
- Exact occurrence due instants resolved in the assignment timezone.
- Seven-calendar-day late-entry windows.
- On-time completion, late completion, and open-overdue counts.
- On-time completion rate and average completed lateness.
- Current 30-day and 90-day comparison with equivalent previous windows.
- Assignment, athlete, team, and organization trend summaries and drill-downs.
- Explicit unavailable and insufficient-history states.
- Forward-safe migration and non-retroactive historical policy.
- Tenant-aware unit, integration, component, and browser coverage.

### Deferred

- Configurable intervention thresholds or red/yellow/green risk bands.
- PostHog analytics until PostHog is introduced.
- Forecasting, anomaly detection, or predictive risk scores.
- Attendance, readiness, wellness, training load, and exercise quality.
- Custom due policies per team, assignment, workout, plan slot, or athlete.
- Staff overrides of individual occurrence deadlines.
- Notifications and escalation workflows.
- All-time trend comparison.

## Approved Product Policy

### Deadline Rules

- Use the assignment timezone for every deadline and late-entry calculation.
- Treat fixed workout assignments as due at the end of their scheduled local date.
- Treat fixed-day plan occurrences as due at the end of their scheduled local date.
- Treat weekly-frequency targets as due at the end of Sunday in the assignment-local week.
- Represent "end of day" as the exclusive local-midnight boundary at the start of the following day.
- Classify a submission as on time when `submittedAt < dueAt`.
- Classify a submission at or after `dueAt` as late.
- Apply no grace period to timeliness classification.
- Preserve daylight-saving behavior by resolving local boundaries with an IANA timezone, never a fixed UTC offset.

### Submission and Late-Entry Rules

- Allow late logging until the exclusive `lateEntryUntil` boundary seven assignment-local calendar days after `dueAt`.
- Allow logging while `now < lateEntryUntil`; reject it at or after the boundary.
- Keep `dueAt` separate from `availableUntil`; availability must not redefine timeliness.
- For policy-eligible occurrences, derive `availableUntil` from `lateEntryUntil` rather than the former end-of-scheduled-day default.
- Preserve the first successful submission timestamp when completed results are edited.
- Do not reclassify timeliness after a completed session is edited.
- Do not allow a late edit to turn an originally on-time submission into a late submission.
- Keep Phase 1 lifecycle statuses unchanged; timeliness is an additional dimension.

### Historical Rules

- Add a timeliness policy effective instant.
- Do not classify occurrences due before the policy effective instant as on time or late.
- Keep Phase 1 completion and overdue history available for pre-policy occurrences.
- Exclude pre-policy occurrences from timeliness rates and trend denominators.
- Show `Insufficient history` until both compared windows contain policy-eligible due work.
- Never infer historical punctuality from a deadline policy that did not exist when work was assigned.

## Core Metric Contract

### Occurrence Timeliness States

- [ ] `notYetDue`: `dueAt > asOf`, regardless of whether the occurrence is available.
- [ ] `onTimeCompleted`: first `submittedAt` exists and `submittedAt < dueAt`.
- [ ] `lateCompleted`: first `submittedAt` exists and `submittedAt >= dueAt`.
- [ ] `openOverdue`: `dueAt <= asOf` and no first submission exists.
- [ ] Keep `Started`, `Due today`, `Completed`, `Overdue`, and `Upcoming` as lifecycle/compliance labels.
- [ ] Display timeliness labels separately so `Completed late` does not conflict with `Completed`.

### Timeliness Formulas

```text
timelinessEligible = onTimeCompleted + lateCompleted + openOverdue
onTimeCompletionRate = onTimeCompleted / timelinessEligible
lateCompletionRate = lateCompleted / timelinessEligible
averageCompletedLateness = average(firstSubmittedAt - dueAt for lateCompleted)
```

- [ ] Select timeliness occurrences by `dueAt`, not `scheduledDate`, `startedAt`, or `submittedAt`.
- [ ] Include only occurrences whose `dueAt <= asOf`.
- [ ] Exclude `notYetDue` and pre-policy occurrences from all timeliness denominators.
- [ ] Return `null` for rates when `timelinessEligible = 0`.
- [ ] Return `null` for average lateness when no late completion exists.
- [ ] Keep raw counts and exact denominators alongside every rate.
- [ ] Report open-overdue age separately from completed lateness.
- [ ] Aggregate organization rates from raw counts rather than averaging team percentages.
- [ ] Deduplicate athlete attention counts across assignments and teams.

### Trend Formulas

- [ ] Compare 30 days with the immediately preceding non-overlapping 30 days.
- [ ] Compare 90 days with the immediately preceding non-overlapping 90 days.
- [ ] Define half-open window boundaries once and reuse them at every aggregation level.
- [ ] Capture one `asOf` instant per request and use it for current and previous summaries.
- [ ] Express rate changes in percentage points, not percent change.
- [ ] Define `change = currentRate - previousRate`.
- [ ] Define direction as `improved`, `declined`, or `unchanged` from the exact change; do not add a configurable threshold.
- [ ] Return an unavailable trend when either compared rate is `null`.
- [ ] Do not calculate an all-time trend.
- [ ] Preserve current and previous numerators and denominators in every trend result.

## Priority Sequence

1. Lock deadline, historical, and trend contracts.
2. Add forward-safe policy and occurrence deadline storage.
3. Centralize timezone-safe deadline and window resolution.
4. Separate late logging availability from due-time classification.
5. Add shared timeliness summaries and trend comparison.
6. Extend team and organization read models.
7. Add assignment and athlete explanations.
8. Add team and organization trend presentation.
9. Complete accessibility, isolation, visual, and repository verification.

## Milestone 1: Policy Contract and Data Model

### Requirements

Persist enough policy data to reproduce a published assignment's deadlines after defaults or product policy change.

### Implementation Checklist

- [x] Add structured assignment columns for timeliness policy version and effective instant.
- [x] Add structured assignment columns for fixed-occurrence deadline boundary, weekly deadline boundary, and late-entry duration.
- [x] Avoid an opaque JSON policy column.
- [x] Add nullable `dueAt` to `assignment_sessions` for legacy compatibility.
- [x] Treat `submittedAt` as the immutable first successful submission timestamp.
- [x] Add database checks for supported policy versions and nonnegative policy values.
- [x] Add an index supporting organization-scoped `dueAt` range queries.
- [x] Keep every new tenant-owned constraint and index organization-aware.
- [x] Update Drizzle inferred types and repository records.
- [x] Create a new forward-only migration; do not rewrite an applied migration.

### Migration and Backfill

- [x] Backfill existing assignments with policy version 1 and the deployment effective instant.
- [x] Backfill approved default policy values without changing Phase 1 occurrence status.
- [x] Leave sessions due before the effective instant without timeliness classification.
- [x] Resolve and backfill `dueAt` only for policy-eligible persisted sessions.
- [x] Derive fixed-workout session deadlines from scheduled date and assignment timezone.
- [x] Derive fixed-day plan session deadlines from scheduled date and assignment timezone.
- [x] Derive weekly-frequency session deadlines from the assignment-local Sunday boundary.
- [x] Make migration execution idempotent under the repository migration runner.
- [x] Add schema integration tests for checks, null legacy rows, and valid policy rows.

### Acceptance Criteria

- [x] Published assignment deadlines remain reproducible after application defaults change.
- [x] Existing assignments continue to render Phase 1 compliance without repair.
- [x] Historical occurrences are not falsely presented as on time or late.
- [x] New sessions cannot cross organization or assignment ownership boundaries through deadline fields.

## Milestone 2: Timezone-Safe Deadline Resolution

### Requirements

Create one pure application-layer resolver used by virtual occurrences, session creation, backfill, and reporting.

### Implementation Checklist

- [x] Add a typed timeliness-policy value object.
- [x] Add a pure `resolveOccurrenceDueAt` function.
- [x] Add a pure `resolveLateEntryUntil` function using assignment-local calendar days.
- [x] Add a pure equivalent-window boundary helper.
- [x] Reject invalid or unsupported IANA timezones at the server boundary.
- [x] Avoid host-timezone-dependent `Date` construction.
- [x] Use the exclusive next-midnight boundary for end-of-day deadlines.
- [x] Resolve weekly-frequency deadlines to the exclusive Monday-midnight boundary after the applicable week.
- [x] Ensure partial first and last assignment weeks retain the approved weekly deadline rule.
- [x] Ensure canceled assignment effective ends do not manufacture later deadlines.

### Unit Tests

- [x] Fixed workout deadline resolves in UTC from assignment-local date.
- [x] Fixed-day plan deadline matches fixed workout semantics.
- [x] Weekly-frequency deadline resolves after Sunday in the assignment-local week.
- [x] Spring-forward transition resolves to the correct instant.
- [x] Fall-back transition resolves to the correct instant.
- [x] Non-hour UTC offsets resolve correctly.
- [x] Seven calendar late-entry days remain calendar-correct across DST changes.
- [x] Boundary equality classifies as late.
- [x] Current and previous windows are equal-length and non-overlapping.
- [x] All-time returns no previous comparison window.

### Acceptance Criteria

- [x] Virtual and persisted versions of the same occurrence resolve identical `dueAt` values.
- [x] Results are independent of the server or test runner timezone.
- [x] DST changes never shift the intended local deadline date.

## Milestone 3: Session Lifecycle and Late Logging

### Requirements

Allow approved late logging without conflating the availability window with the deadline.

### Implementation Checklist

- [x] Resolve and persist `dueAt` when creating a session.
- [x] Resolve `availableUntil` independently as seven local calendar days after `dueAt`.
- [x] Keep explicit earlier assignment availability restrictions when product policy requires them.
- [x] Permit an unstarted fixed occurrence to be opened during its late-entry window.
- [x] Permit a missed weekly-frequency target to be started during its late-entry window without changing its original week.
- [x] Keep late weekly sessions attached to the original plan-slot week and due instant.
- [x] Prevent duplicate sessions for the same athlete, slot, and occurrence identity.
- [x] Preserve `submittedAt` during explicit completed-result edits.
- [x] Prevent resubmission from overwriting first submission time.
- [x] Keep autosave idempotency and optimistic concurrency behavior.
- [x] Return actionable errors when the late-entry window has closed.
- [x] Keep all athlete reads and mutations scoped by organization, assignment recipient, athlete, workout snapshot, slot snapshot, and occurrence identity.

### Tests

- [x] On-time session can start, save, and submit normally.
- [x] Unstarted fixed work can be submitted during the seven-day late window.
- [x] Weekly-frequency work can be logged late against its original week.
- [x] Logging is rejected after the late-entry boundary.
- [x] Completed-result edits preserve first submission time and classification.
- [x] Retry and duplicate mutation IDs do not change first submission time.
- [x] An athlete cannot create or mutate another athlete's late session.
- [x] A foreign organization cannot use a valid occurrence identity to create a session.

### Acceptance Criteria

- [x] Late logging is possible for exactly the approved calendar window.
- [x] On-time classification is stable after submission.
- [x] Offline-safe idempotency remains intact.

## Milestone 4: Shared Timeliness Summary Domain

### Requirements

Build timeliness as a shared application-layer model beside, not inside pages or route components.

### Implementation Checklist

- [ ] Add `OccurrenceTimeliness` with due instant, first submission instant, state, and lateness duration.
- [ ] Add `TimelinessCounts` with on-time completed, late completed, open overdue, and not-yet-due counts.
- [ ] Add `TimelinessSummary` with counts, eligible denominator, rates, average completed lateness, and oldest open-overdue instant.
- [ ] Add a pure occurrence classifier.
- [ ] Add a pure `buildTimelinessSummary` function.
- [ ] Keep Phase 1 `ComplianceSummary` backward compatible.
- [ ] Keep compliance status and timeliness state independently testable.
- [ ] Deduplicate athletes needing timeliness attention by athlete ID.
- [ ] Use one merge path for assignment, team, and organization summaries.
- [ ] Return structured unavailable reasons such as `no_due_work` and `insufficient_history`.

### Unit Tests

- [ ] Submission immediately before `dueAt` is on time.
- [ ] Submission exactly at `dueAt` is late.
- [ ] Submission after `dueAt` is late.
- [ ] Unsubmitted occurrence before `dueAt` is not yet due.
- [ ] Unsubmitted occurrence at or after `dueAt` is open overdue.
- [ ] Pre-policy occurrence is excluded.
- [ ] On-time rate uses the exact raw-count denominator.
- [ ] Average lateness includes only late completions.
- [ ] No late completions returns unavailable average lateness.
- [ ] Athlete attention is deduplicated across assignments.
- [ ] Organization athlete attention is deduplicated across teams.
- [ ] Empty input returns unavailable rates rather than 100%.

### Acceptance Criteria

- [ ] No page or query layer independently computes timeliness percentages.
- [ ] Every rate exposes its numerator and denominator.
- [ ] Phase 1 counts remain unchanged for identical occurrence fixtures.

## Milestone 5: Equivalent-Window Trend Domain

### Requirements

Compare summaries without overlapping windows, averaging percentages, or hiding unavailable data.

### Implementation Checklist

- [ ] Add `MetricComparison` with current value, previous value, percentage-point change, and direction.
- [ ] Add `ComplianceTrendSummary` containing current and previous raw summaries.
- [ ] Build comparisons from summary numerators and denominators.
- [ ] Keep current and previous occurrence sets disjoint at exact boundaries.
- [ ] Use the same policy-effective and tenant filters in both windows.
- [ ] Return `insufficient_history` when either side lacks eligible data.
- [ ] Keep all-time comparison unavailable by contract.
- [ ] Avoid invented statistical significance or risk thresholds.

### Unit Tests

- [ ] Positive percentage-point change is improved.
- [ ] Negative percentage-point change is declined.
- [ ] Equal rates are unchanged.
- [ ] Equal percentages with different denominators preserve both fractions.
- [ ] Missing current or previous denominator is unavailable.
- [ ] A boundary occurrence appears in exactly one window.
- [ ] Current and previous summaries use the same `asOf` instant.

### Acceptance Criteria

- [ ] Trend direction can always be explained by visible raw counts.
- [ ] No team or organization trend is calculated by averaging child rates.
- [ ] All-time views remain free of misleading trend indicators.

## Milestone 6: Team Timeliness and Trend Read Model

### Requirements

Extend the authorized team read model while preserving publish-time recipient scope and Phase 1 reconciliation.

### Implementation Checklist

- [ ] Return current and previous timeliness summaries for the selected team.
- [ ] Return timeliness and trend summaries per assignment.
- [ ] Return timeliness summaries per athlete and occurrence.
- [ ] Filter current and previous sets by resolved `dueAt` boundaries.
- [ ] Preserve assignment cancellation history according to Phase 1 rules.
- [ ] Preserve publish-time recipient-to-team scope in both windows.
- [ ] Capture one database/request `asOf` instant.
- [ ] Avoid loading foreign-team recipients before application filtering.
- [ ] Add query indexes only after validating query plans against realistic fixtures.
- [ ] Keep direct-athlete assignments out of team rows unless publish-time scope identifies the team.

### Integration Tests

- [ ] Team current and previous counts reconcile with assignment summaries.
- [ ] On-time, late, and open-overdue assignments aggregate correctly.
- [ ] Window boundary occurrences appear once.
- [ ] Canceled assignment history follows the same rule in both windows.
- [ ] Removed team members remain represented through publish-time scope.
- [ ] Team Viewer can read the model without mutation permissions.
- [ ] Unmanaged and foreign teams return no data.
- [ ] Pre-policy work does not enter timeliness denominators.
- [ ] Zero due work and insufficient history remain distinct.

### Acceptance Criteria

- [ ] Team trends are mathematically consistent with assignment and athlete detail.
- [ ] Team size does not bias normalized comparisons.
- [ ] Tenant isolation applies equally to current and previous windows.

## Milestone 7: Organization Timeliness and Trend Read Model

### Requirements

Aggregate organization trends from raw occurrence facts while deduplicating athlete-level attention.

### Implementation Checklist

- [ ] Return current and previous organization timeliness summaries.
- [ ] Return one current/previous comparison per team.
- [ ] Aggregate organization numerators and denominators from occurrences, not team rates.
- [ ] Deduplicate multi-team athletes in organization attention counts.
- [ ] Preserve team IDs and names for canonical drill-down links.
- [ ] Include direct-athlete assignments in organization totals.
- [ ] Exclude direct-athlete assignments from team rows without publish-time scope.
- [ ] Use identical policy, cancellation, and window filters across organization and team summaries.
- [ ] Exclude foreign-organization assignments, recipients, sessions, and scopes at the database boundary.

### Integration Tests

- [ ] Weighted organization trend differs correctly from an average of team rates.
- [ ] Multi-team athletes are deduplicated in each window.
- [ ] Direct-athlete work follows the documented organization-only rule.
- [ ] Team rows reconcile with organization totals where scopes overlap.
- [ ] Foreign-organization facts cannot influence either compared window.
- [ ] Empty organizations return unavailable metrics.
- [ ] New organizations return insufficient history until both windows qualify.

### Acceptance Criteria

- [ ] Directors can compare teams without size bias.
- [ ] Organization changes can be explained through team and assignment facts.
- [ ] No cross-tenant data enters trend calculations.

## Milestone 8: Assignment and Athlete Timeliness Drill-Down

### Requirements

Explain aggregate timeliness through the existing assignment, athlete, occurrence, and result-review paths.

### Implementation Checklist

- [ ] Show assignment on-time fraction and average completed lateness.
- [ ] Show athlete on-time fraction, late completions, and open-overdue work.
- [ ] Show each occurrence due date/time in the assignment timezone.
- [ ] Label completed occurrences as `On time` or `Completed late`.
- [ ] Show lateness duration for late completions.
- [ ] Show overdue age for unsubmitted overdue occurrences.
- [ ] Keep upcoming/not-yet-due occurrences visually secondary.
- [ ] Sort open overdue first, then late completed, due soon, on-time completed, and not yet due.
- [ ] Preserve result-review links and selected-window context.
- [ ] Keep Team Viewer access read-only.
- [ ] Keep athlete access limited to athlete-owned routes.
- [ ] Keep athlete-facing language factual and non-punitive.

### Acceptance Criteria

- [ ] Staff can identify every occurrence contributing to a timeliness numerator or denominator.
- [ ] Parent assignment totals reconcile with athlete and occurrence rows.
- [ ] No staff-only peer comparison is exposed to athletes.

## Milestone 9: Team and Organization Trend Presentation

### Requirements

Add concise comparisons to existing dashboards without replacing actionable Phase 1 exception queues.

### Team Dashboard

- [ ] Add on-time completion rate with fraction.
- [ ] Add percentage-point change versus the equivalent previous window.
- [ ] Add average completed lateness with sample count.
- [ ] Add open-overdue count and oldest age.
- [ ] Add assignment comparison details without nested cards.
- [ ] Keep Phase 1 completion rate and attention KPIs visible.
- [ ] Do not show trend for all-time.
- [ ] Show `Insufficient history` rather than a neutral arrow.

### Organization Dashboard

- [ ] Add weighted organization on-time rate with fraction.
- [ ] Add percentage-point change versus the equivalent previous window.
- [ ] Add teams improving, declining, and unavailable counts without configurable thresholds.
- [ ] Add team comparison columns for current, previous, change, and denominators.
- [ ] Sort open-overdue intervention needs before trend direction.
- [ ] Preserve selected-window links to team dashboards.
- [ ] Keep operational roster counts visually secondary.

### Trend Visualization

- [ ] Start with accessible text and dense comparison tables.
- [ ] Add a chart only when it improves interpretation beyond current/previous values.
- [ ] If a chart is added, use the established chart library and provide an equivalent accessible table.
- [ ] Do not encode direction by color alone.
- [ ] Do not imply statistical significance.

### Acceptance Criteria

- [ ] Staff can distinguish current performance from change over time.
- [ ] Every change exposes both compared fractions.
- [ ] Dashboard hierarchy still prioritizes actionable overdue work.

## Milestone 10: Definitions, Accessibility, and Responsive UX

### In-Product Definitions

- [ ] Define due instant in assignment-local language.
- [ ] Define on-time completion and boundary equality.
- [ ] Define late completion and open overdue separately.
- [ ] Explain the seven-day late-entry window.
- [ ] Explain that completed means submitted logging, not verified training quality.
- [ ] Explain equivalent previous windows and percentage-point change.
- [ ] Explain why all-time has no trend.
- [ ] Explain `No due work` and `Insufficient history` separately.

### Accessibility and Visual Checks

- [ ] Use semantic `dl` elements for metric label, value, and denominator.
- [ ] Use scoped table headers for comparison and occurrence tables.
- [ ] Include direction text or icons in addition to color.
- [ ] Ensure filters and drill-down links work by keyboard.
- [ ] Ensure screen readers announce current fraction, previous fraction, and change together.
- [ ] Ensure due times include timezone context.
- [ ] Verify long athlete and assignment names at mobile widths.
- [ ] Verify fractions, lateness durations, and trend labels do not overlap or truncate.
- [ ] Verify tables use contained horizontal scrolling without document overflow.
- [ ] Capture desktop and mobile screenshots for team, organization, assignment, and athlete surfaces.

### Acceptance Criteria

- [ ] A new coach can explain every timeliness metric from the interface.
- [ ] Trend meaning is consistent at assignment, athlete, team, and organization levels.
- [ ] Keyboard, focus, screen-reader semantics, contrast, and responsive checks pass.

## Milestone 11: Final Verification and Rollout

### Unit and Integration

- [ ] Deadline resolver tests pass across timezones and DST boundaries.
- [ ] Timeliness summary and trend comparison unit tests pass.
- [ ] Session lifecycle and late-entry integration tests pass.
- [ ] Team and organization current/previous query tests pass.
- [ ] Tenant-isolation and publish-time-scope tests pass.
- [ ] Existing Phase 1 compliance tests remain green without changed expected counts.
- [ ] Existing offline-safe session mutation tests remain green.

### Browser / E2E

- [ ] Coach publishes fixed and weekly training with policy version 1.
- [ ] Athlete completes an occurrence before its deadline and it displays `On time`.
- [ ] Athlete completes an occurrence during the late window and it displays `Completed late`.
- [ ] Athlete cannot log after the late-entry boundary.
- [ ] Completed-result edit preserves original timeliness classification.
- [ ] Team 30-day and 90-day views compare equivalent previous windows.
- [ ] All-time view displays no trend.
- [ ] Team Viewer can inspect detail but cannot mutate comments or assignments.
- [ ] Athlete cannot access staff trend routes or another athlete's detail.
- [ ] Removed Team Manager loses trend access on the next sensitive request.
- [ ] Foreign-team and foreign-organization routes fail without leaking metric values.

### Migration and Operational Verification

- [ ] Apply the migration against an empty database.
- [ ] Apply the migration against a representative Phase 1 database.
- [ ] Confirm migration reruns do not duplicate or corrupt backfill data.
- [ ] Confirm pre-policy data remains excluded from timeliness metrics.
- [ ] Confirm post-policy sessions receive deterministic due instants.
- [ ] Inspect query plans for 30-day and 90-day team and organization reads.
- [ ] Record the policy effective instant used in production rollout.
- [ ] Document how support identifies policy version and due instant for an occurrence.

### Required Repository Checks

- [ ] `npm run validate` passes.
- [ ] `npm run build` passes.
- [ ] Product documentation reflects final policy, formulas, labels, and historical limitations.
- [ ] No unrelated dependency is introduced.

## Phase 2 Done Definition

- [ ] Every policy-eligible occurrence has a deterministic due instant.
- [ ] Persisted and virtual occurrences resolve identical deadlines.
- [ ] Late logging is allowed for exactly seven assignment-local calendar days.
- [ ] First submission time and timeliness classification remain stable after edits and retries.
- [ ] Assignment, athlete, team, and organization on-time metrics share one formula implementation.
- [ ] Current and previous windows are equal, non-overlapping, and use one `asOf` instant.
- [ ] Organization rates and trends use raw counts rather than averaged team rates.
- [ ] Every rate and change exposes its underlying fractions.
- [ ] Pre-policy history is never presented as measured timeliness.
- [ ] Publish-time scope, tenant isolation, and athlete ownership are preserved.
- [ ] Unit, integration, E2E, accessibility, responsive, and visual checks pass.
- [ ] `npm run validate` and `npm run build` pass.

## Rollout Gates

- [ ] Coaches confirm the approved deadline and late-entry language is understandable.
- [ ] Directors confirm percentage-point comparisons and denominators are useful.
- [ ] Support receives the policy-version and deadline troubleshooting guide.
- [ ] PostHog analytics remain deferred until PostHog is introduced.
- [ ] Configurable thresholds remain deferred until real usage demonstrates a stable intervention policy.
