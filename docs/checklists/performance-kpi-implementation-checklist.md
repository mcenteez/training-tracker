# Performance KPI Implementation Checklist

## Objective

Implement a simple, actionable compliance system for team coaches and organization directors using data Training Tracker already collects.

The first release must answer:

1. Where does staff attention need to go now?
2. Is prescribed training being completed consistently?
3. Which teams, assignments, and athletes explain the result?

Reference definitions and product rationale: [performance-kpi-recommendations.md](performance-kpi-recommendations.md).

## Scope

### Phase 1 Included

- Completion and outstanding rates
- Athletes needing attention
- Overdue, started, due-today, completed, and upcoming occurrence counts
- Athlete programming coverage
- Team KPI summary
- Assignment-priority rows
- Organization KPI summary
- Team comparison table
- Existing assignment, athlete, occurrence, and result drill-downs
- 30-day, 90-day, and all-time windows

### Phase 1 Excluded

- Readiness scores
- Injury or illness availability
- Attendance
- Session RPE and duration
- Internal or external training load
- Wellness and sleep
- Exercise quality
- On-time completion and lateness
- Trend arrows or previous-window comparisons
- Universal red/yellow/green risk thresholds

## Core Metric Contract

### Terminology

- [x] Rename display label `Assigned` to `Due today`.
- [x] Rename display label `In progress` to `Started`.
- [x] Rename display label `Submitted` to `Completed`.
- [x] Rename display label `Missed` to `Overdue`.
- [x] Keep `Upcoming` unchanged.
- [x] Keep database status values unchanged; terminology changes are presentation-only.
- [x] Document that completed means results were submitted, not staff-verified quality.

### Formulas

- [x] Define `eligibleDue = completed + overdue + started + dueToday`.
- [x] Define `completionRate = completed / eligibleDue`.
- [x] Define `outstandingRate = (overdue + started + dueToday) / eligibleDue`.
- [x] Exclude upcoming occurrences from rate denominators.
- [x] Return `null` rather than `100%` when `eligibleDue = 0`.
- [x] Define `athletesNeedingAttention` as unique athletes with at least one overdue occurrence.
- [x] Define `athleteCoverage` as athletes with eligible due work divided by rostered athletes.
- [x] Define `engagementRate` as athletes with started or completed work divided by athletes with eligible due work.
- [x] Preserve raw counts alongside rates for context.

### Denominator and Historical Rules

- [x] Include started and due-today work as eligible but incomplete.
- [x] Preserve canceled-assignment historical sessions and occurrences according to current domain rules.
- [x] Use publish-time recipient-to-team scope for all team and organization compliance calculations.
- [x] Deduplicate athletes across teams in organization-level athlete counts.
- [x] Apply assignment timezone when deriving occurrence status.
- [x] Apply the selected 30-day, 90-day, or all-time window consistently at every aggregation level.

## Milestone 1: Shared Compliance Summary Domain

### Requirements

Create one reusable application-layer summary model used by assignment, team, and organization views.

### Implementation Checklist

- [x] Add a `ComplianceCounts` type with completed, overdue, started, dueToday, and upcoming counts.
- [x] Add a `ComplianceSummary` type with counts, eligibleDue, completionRate, outstandingRate, and attention counts.
- [x] Add a pure `buildComplianceSummary` function.
- [x] Add helpers for unique athlete attention and programming-coverage calculations.
- [x] Keep the existing occurrence classification logic as the source of truth.
- [x] Avoid duplicating rate formulas in pages or React components.
- [x] Use `null` for unavailable ratios and format them at the presentation boundary.
- [x] Add short comments only where denominator or deduplication behavior is non-obvious.

### Unit Tests

- [x] Calculates completion rate from mutually exclusive occurrence counts.
- [x] Excludes upcoming work from eligible due work.
- [x] Includes started and due-today work as incomplete eligible work.
- [x] Returns no rate when no work is due.
- [x] Counts each overdue athlete once across multiple assignments.
- [x] Deduplicates an athlete across multiple teams for organization attention counts.
- [x] Calculates programming coverage using rostered-athlete denominator.
- [x] Preserves canceled-assignment historical behavior.
- [x] Handles empty teams and organizations.

### Acceptance Criteria

- [x] Assignment, team, and organization KPIs use the same metric calculator.
- [x] No page computes compliance percentages independently.
- [x] Formula tests document every denominator rule in the recommendations.

## Milestone 2: Team Compliance Read Model

### Requirements

Extend the existing team compliance query so the page receives assignment summaries, team totals, and athlete attention data in one authorized read model.

### Implementation Checklist

- [x] Add a team-level summary across all visible assignments in the selected window.
- [x] Add unique athletes needing attention.
- [x] Add athlete programming-coverage numerator and denominator.
- [x] Add oldest overdue scheduled date or overdue age when available.
- [x] Add per-assignment compliance summary fields.
- [x] Add per-recipient compliance summary fields for drill-down sorting.
- [x] Preserve current organization and team authorization filters.
- [x] Preserve publish-time team provenance.
- [x] Avoid N+1 queries while calculating assignment and athlete summaries.
- [x] Keep assignment and session IDs available for existing drill-down routes.

### Integration Tests

- [x] Returns team totals matching the sum of assignment occurrence summaries.
- [x] Returns unique attention-athlete count across multiple assignments.
- [x] Excludes another team and another organization.
- [x] Uses publish-time scope after roster membership changes.
- [x] Applies 30-day, 90-day, and all-time windows consistently.
- [x] Handles canceled assignments with historical sessions.
- [x] Handles a team with no published assignments.

### Acceptance Criteria

- [x] One team query provides all data needed by the team KPI strip and assignment list.
- [x] Team totals and drill-down totals reconcile exactly.
- [x] Tenant and team isolation remain enforced at the query boundary.

## Milestone 3: Team Dashboard KPI Strip

### Requirements

Give coaches a fast operational summary before assignment detail.

### Implementation Checklist

- [x] Add a four-column responsive KPI strip above assignment rows.
- [x] Show `Completion rate` as percentage plus fraction.
- [x] Show `Athletes needing attention` as a unique-athlete count.
- [x] Show `Overdue work` as occurrence count.
- [x] Show `Due now` with started and due-today detail.
- [x] Show `No due work` when completion-rate denominator is zero.
- [x] Keep upcoming workload outside the primary KPI strip.
- [x] Ensure all values update with the selected time window.
- [x] Add concise accessible descriptions for each KPI.
- [x] Do not use color as the only indicator of an exception.
- [x] Avoid decorative progress rings or gauges that obscure exact values.

### Empty and Error States

- [x] Team with no assignments explains that no compliance data exists.
- [x] Team with upcoming-only work shows no due work and the upcoming count separately.
- [x] Query failure retains the existing recoverable error state.
- [x] Loading layout preserves KPI-strip dimensions to avoid page shift.

### Acceptance Criteria

- [x] A coach can identify current compliance and required attention without scanning assignment rows.
- [x] Rates always display their numerator and denominator.
- [x] Upcoming work cannot inflate or depress completion rate.

## Milestone 4: Assignment Priority Rows

### Requirements

Replace equal-weight status counters with an action-oriented summary while retaining deep-dive navigation.

### Implementation Checklist

- [x] Show assignment name, source type, schedule, and lifecycle status.
- [x] Show completion rate and completed/eligible fraction prominently.
- [x] Show unique athletes needing attention.
- [x] Show started and due-today counts as due-now context.
- [x] Show upcoming count as secondary workload context.
- [x] Replace `Latest activity` with `Latest completion` when a submitted timestamp exists.
- [x] Show a neutral no-activity label when no completion exists.
- [x] Sort assignments with overdue attention first.
- [x] Then sort by due-now work, then upcoming-only work, then assignment name.
- [x] Use warning styling only when overdue work exists.
- [x] Keep lifecycle status visually secondary to compliance status.
- [x] Preserve the assignment-detail link and selected window query parameter.

### Acceptance Criteria

- [x] Assignment rows can be compared despite different recipient and schedule sizes.
- [x] Highest-attention assignments appear first by default.
- [x] Raw status counts remain available through row detail or drill-down.

## Milestone 5: Athlete and Occurrence Drill-Down

### Requirements

Explain every aggregate through athlete-level and occurrence-level detail.

### Implementation Checklist

- [x] Add per-athlete completion fraction.
- [x] Add per-athlete overdue count.
- [x] Add started and due-today context.
- [x] Keep the occurrence timeline with completed, overdue, started, due today, and upcoming states.
- [x] Sort athletes by overdue, started, due today, fully compliant, then upcoming-only.
- [x] Keep submitted-session review links.
- [x] Keep viewer access read-only.
- [x] Keep athlete access restricted to athlete-owned routes.
- [x] Preserve selected-window context while navigating back to team performance.
- [x] Ensure visible athlete totals reconcile with assignment-row totals.

### Acceptance Criteria

- [x] Coaches can identify exactly which athlete and occurrence explains each exception.
- [x] No athlete or result data leaks across team or organization scope.
- [x] Drill-down totals reconcile with team and assignment summaries.

## Milestone 6: Organization Compliance Read Model

### Requirements

Provide directors with organization-level rollups and team comparison using the same metric definitions as team views.

Direct-athlete assignments contribute to organization totals and programming coverage, but not to a team comparison row unless the persisted publish-time recipient scope identifies a team.

### Implementation Checklist

- [x] Add an organization compliance query scoped by active organization.
- [x] Return organization-wide occurrence counts and summary rates.
- [x] Return unique athletes needing attention across all teams.
- [x] Deduplicate athletes assigned through multiple teams.
- [x] Return programming-coverage numerator and organization-athlete denominator.
- [x] Return one comparison summary per team.
- [x] Include team IDs and names for canonical team-performance links.
- [x] Preserve publish-time team provenance.
- [x] Exclude inaccessible foreign-organization data.
- [x] Avoid summing team rates; calculate organization rate from organization numerator and denominator.
- [x] Define how direct-athlete assignments without a team scope appear at organization level.

### Integration Tests

- [x] Organization totals use raw occurrence numerators and denominators rather than averaging team percentages.
- [x] Multi-team athletes are deduplicated in athlete attention and coverage counts.
- [x] Team comparison totals reconcile with organization totals where scopes overlap.
- [x] Direct-athlete assignments are handled according to the documented rule.
- [x] Foreign-organization assignments and sessions are excluded.
- [x] Window filtering matches team behavior.
- [x] Zero-due-work organizations return unavailable rates.

### Acceptance Criteria

- [x] Organization metrics are mathematically consistent with team metrics.
- [x] Directors can compare teams without size bias.
- [x] Tenant isolation is enforced in every organization aggregate.

## Milestone 7: Organization Dashboard

### Requirements

Replace the compliance placeholder and demote roster administration counts below performance outcomes.

### Implementation Checklist

- [x] Add 30-day, 90-day, and all-time controls.
- [x] Add organization completion rate with fraction.
- [x] Add teams needing attention with tracked-team denominator.
- [x] Add unique athletes needing attention.
- [x] Add programming coverage with fraction.
- [x] Move teams, athletes, roster entries, and invitation counts into a secondary operational summary.
- [x] Replace the compliance placeholder card with live metrics.
- [x] Add a team comparison table or dense list.
- [x] Show team completion rate and fraction.
- [x] Show team athletes needing attention.
- [x] Show team overdue count.
- [x] Show team started and due-today counts.
- [x] Show team programming coverage.
- [x] Sort teams needing intervention first.
- [x] Link each team row to its canonical team-performance dashboard with the selected window.
- [x] Avoid trend arrows until equivalent previous-window comparison is implemented.

### Empty and Access States

- [x] Organization with no teams shows setup guidance.
- [x] Organization with teams but no due work shows no due work, not 100%.
- [x] Organization Viewer sees read-only compliance data.
- [x] Athlete remains unable to access organization performance.
- [x] Team roles from another organization cannot influence organization metrics.

### Acceptance Criteria

- [x] Directors can identify which teams require intervention from one screen.
- [x] Organization rates expose exact denominators.
- [x] Operational roster counts do not compete visually with compliance outcomes.

## Milestone 8: KPI Definitions and Accessibility

### Requirements

Users must be able to understand and trust every metric without relying on institutional folklore.

### Implementation Checklist

- [x] Add concise in-product definitions for completion rate, due work, overdue work, and programming coverage.
- [x] Explain that completion reflects submitted logging, not verified training quality.
- [x] Explain selected-window behavior.
- [x] Explain `No due work` and unavailable percentages.
- [x] Use semantic `dl`, table headers, and status text where appropriate.
- [x] Ensure keyboard navigation through time filters and drill-down links.
- [x] Ensure warning states have text or icons in addition to color.
- [x] Verify mobile layouts do not truncate rates, fractions, or athlete names.
- [x] Verify screen-reader output includes metric label, value, and denominator.
- [x] Keep displayed terminology consistent across team, organization, assignment, and athlete views.

### Acceptance Criteria

- [x] A new coach can interpret each KPI from the interface alone.
- [x] KPI meaning is consistent across all dashboard levels.
- [x] Accessibility checks pass for keyboard, focus, semantics, and contrast.

## Milestone 9: Verification and Rollout

### Unit and Integration

- [x] Compliance summary unit tests pass.
- [x] Team compliance integration tests pass.
- [x] Organization compliance integration tests pass.
- [x] Existing assignment-session and tenant-isolation tests remain green.

### Browser / E2E

#### Team Dashboard

- [x] Team Manager sees completion rate with completed/eligible fraction.
- [x] Team Manager sees unique athletes needing attention, overdue work, and due-now detail.
- [x] Team KPI strip uses `Due today`, `Started`, `Completed`, `Overdue`, and `Upcoming` terminology.
- [x] Upcoming-only work displays `No due work` rather than `100%` completion.
- [x] Upcoming occurrences do not change the displayed completion-rate denominator.
- [x] 30-day, 90-day, and all-time controls update every team KPI consistently.
- [x] Selected time window remains in assignment and back-navigation URLs.
- [x] Assignment rows display completion rate, fraction, attention count, due-now detail, and upcoming context.
- [x] Assignment rows with overdue work sort ahead of due-now and upcoming-only assignments.
- [x] Assignment rows without overdue work do not show warning treatment.
- [x] Team with no published assignments displays the compliance empty state.

#### Assignment and Athlete Drill-Down

- [x] Assignment drill-down totals reconcile with the selected assignment row.
- [x] Athlete rows display completion fraction and overdue count.
- [x] Athletes with overdue work sort ahead of started, due-today, compliant, and upcoming-only athletes.
- [x] Occurrence timeline uses the same terminology and status counts as the parent summaries.
- [x] Submitted occurrence exposes the existing result-review link.
- [x] Team Viewer can inspect KPI and result detail but cannot mutate comments or assignments.
- [x] Athlete cannot access another athlete's assignment, occurrence, or staff-review routes.

#### Organization Dashboard

- [x] Organization KPI strip renders completion rate with the aggregate completed/eligible fraction.
- [x] Organization KPI strip renders teams needing attention with tracked-team denominator.
- [x] Organization KPI strip renders unique athletes needing attention and programming coverage.
- [x] Organization total is weighted from raw occurrence counts rather than averaging team percentages.
- [x] Organization with teams but no eligible due work displays `No due work`.
- [x] Organization with no teams displays setup guidance.
- [x] Team comparison rows display completion fraction, attention athletes, overdue work, due-now detail, and coverage.
- [x] Teams needing attention sort ahead of teams without overdue work.
- [x] Team comparison links to the scoped team dashboard and preserves the selected time window.
- [x] Operational roster and invitation counts remain visually secondary to compliance KPIs.

#### Access and Isolation

- [x] Organization Viewer sees organization and team KPI surfaces in read-only mode.
- [x] Athlete cannot access team-staff or organization KPI routes.
- [x] Removed Team Manager loses KPI access on the next sensitive request.
- [x] Foreign-team and foreign-organization KPI routes fail safely without exposing names or counts.
- [x] Organization rollups exclude foreign-organization assignments and sessions.

### Visual Verification

- [x] Capture desktop and mobile screenshots of team dashboard.
- [x] Capture desktop and mobile screenshots of organization dashboard.
- [x] Verify dense data remains scannable without nested cards.
- [x] Verify no overlap, truncation, or horizontal overflow.
- [x] Verify all zero, empty, warning, and normal states.

### Required Repository Checks

- [x] `npm run validate` passes.
- [x] `npm run build` passes.
- [x] Database migrations are not required for Phase 1.
- [x] Product documentation reflects final implemented formulas and labels.

### Rollout

- [x] Compare old status counts with new summaries in test fixtures before removing old presentation.
- [ ] Confirm coaches understand `Due today`, `Started`, `Completed`, and `Overdue` terminology.
- [ ] Confirm organization directors prefer weighted organization rates over average team rates.
- [ ] Add product analytics for team-row and athlete-drill-down usage when PostHog is introduced.
- [x] Do not add configurable thresholds until real usage demonstrates a stable intervention policy.

## Phase 1 Done Definition

- [x] Team dashboard leads with completion rate and actionable exceptions.
- [x] Assignment rows use normalized rates and attention counts.
- [x] Athlete drill-down explains every team-level exception.
- [x] Organization dashboard rolls up compliance and compares teams.
- [x] Team and organization metrics share one formula implementation.
- [x] Every percentage shows or exposes its denominator.
- [x] Zero-due-work states never display a misleading 100%.
- [x] Publish-time scope and tenant isolation are preserved.
- [x] Unit, integration, E2E, accessibility, and visual checks pass.
- [x] `npm run validate` and `npm run build` pass.

## Future Phase Gates

### Phase 2: Timeliness and Trends

Do not start until staff defines an occurrence due-time policy.

- [ ] Add explicit due time or due instant to assignment occurrences.
- [ ] Define on-time completion and lateness formulas.
- [ ] Add equivalent previous-window comparison.
- [ ] Add athlete, assignment, team, and organization trend views.
- [ ] Add configurable intervention rules with auditability.

### Phase 3: Availability and Readiness

Do not start until privacy, role visibility, and intervention protocols are approved.

- [ ] Add athlete availability state and effective dates.
- [ ] Define restricted medical and non-medical reason visibility.
- [ ] Add a minimal readiness questionnaire.
- [ ] Define staff action for each readiness response.
- [ ] Report questionnaire response compliance separately from readiness status.

### Phase 4: Training Load

Do not start until session duration, RPE, and normalized load units are modeled.

- [ ] Add session duration.
- [ ] Add session RPE.
- [ ] Calculate internal load as duration in minutes multiplied by session RPE.
- [ ] Normalize external-load and strength-volume units.
- [ ] Compare prescribed work, completed work, and internal response.
- [ ] Use individual rolling baselines rather than universal thresholds.
