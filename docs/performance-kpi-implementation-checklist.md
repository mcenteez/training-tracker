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

- [ ] Rename display label `Assigned` to `Due today`.
- [ ] Rename display label `In progress` to `Started`.
- [ ] Rename display label `Submitted` to `Completed`.
- [ ] Rename display label `Missed` to `Overdue`.
- [ ] Keep `Upcoming` unchanged.
- [ ] Keep database status values unchanged; terminology changes are presentation-only.
- [ ] Document that completed means results were submitted, not staff-verified quality.

### Formulas

- [ ] Define `eligibleDue = completed + overdue + started + dueToday`.
- [ ] Define `completionRate = completed / eligibleDue`.
- [ ] Define `outstandingRate = (overdue + started + dueToday) / eligibleDue`.
- [ ] Exclude upcoming occurrences from rate denominators.
- [ ] Return `null` rather than `100%` when `eligibleDue = 0`.
- [ ] Define `athletesNeedingAttention` as unique athletes with at least one overdue occurrence.
- [ ] Define `athleteCoverage` as athletes with eligible due work divided by rostered athletes.
- [ ] Define `engagementRate` as athletes with started or completed work divided by athletes with eligible due work.
- [ ] Preserve raw counts alongside rates for context.

### Denominator and Historical Rules

- [ ] Include started and due-today work as eligible but incomplete.
- [ ] Preserve canceled-assignment historical sessions and occurrences according to current domain rules.
- [ ] Use publish-time recipient-to-team scope for all team and organization compliance calculations.
- [ ] Deduplicate athletes across teams in organization-level athlete counts.
- [ ] Apply assignment timezone when deriving occurrence status.
- [ ] Apply the selected 30-day, 90-day, or all-time window consistently at every aggregation level.

## Milestone 1: Shared Compliance Summary Domain

### Requirements

Create one reusable application-layer summary model used by assignment, team, and organization views.

### Implementation Checklist

- [ ] Add a `ComplianceCounts` type with completed, overdue, started, dueToday, and upcoming counts.
- [ ] Add a `ComplianceSummary` type with counts, eligibleDue, completionRate, outstandingRate, and attention counts.
- [ ] Add a pure `buildComplianceSummary` function.
- [ ] Add helpers for unique athlete attention and programming-coverage calculations.
- [ ] Keep the existing occurrence classification logic as the source of truth.
- [ ] Avoid duplicating rate formulas in pages or React components.
- [ ] Use `null` for unavailable ratios and format them at the presentation boundary.
- [ ] Add short comments only where denominator or deduplication behavior is non-obvious.

### Unit Tests

- [ ] Calculates completion rate from mutually exclusive occurrence counts.
- [ ] Excludes upcoming work from eligible due work.
- [ ] Includes started and due-today work as incomplete eligible work.
- [ ] Returns no rate when no work is due.
- [ ] Counts each overdue athlete once across multiple assignments.
- [ ] Deduplicates an athlete across multiple teams for organization attention counts.
- [ ] Calculates programming coverage using rostered-athlete denominator.
- [ ] Preserves canceled-assignment historical behavior.
- [ ] Handles empty teams and organizations.

### Acceptance Criteria

- [ ] Assignment, team, and organization KPIs use the same metric calculator.
- [ ] No page computes compliance percentages independently.
- [ ] Formula tests document every denominator rule in the recommendations.

## Milestone 2: Team Compliance Read Model

### Requirements

Extend the existing team compliance query so the page receives assignment summaries, team totals, and athlete attention data in one authorized read model.

### Implementation Checklist

- [ ] Add a team-level summary across all visible assignments in the selected window.
- [ ] Add unique athletes needing attention.
- [ ] Add athlete programming-coverage numerator and denominator.
- [ ] Add oldest overdue scheduled date or overdue age when available.
- [ ] Add per-assignment compliance summary fields.
- [ ] Add per-recipient compliance summary fields for drill-down sorting.
- [ ] Preserve current organization and team authorization filters.
- [ ] Preserve publish-time team provenance.
- [ ] Avoid N+1 queries while calculating assignment and athlete summaries.
- [ ] Keep assignment and session IDs available for existing drill-down routes.

### Integration Tests

- [ ] Returns team totals matching the sum of assignment occurrence summaries.
- [ ] Returns unique attention-athlete count across multiple assignments.
- [ ] Excludes another team and another organization.
- [ ] Uses publish-time scope after roster membership changes.
- [ ] Applies 30-day, 90-day, and all-time windows consistently.
- [ ] Handles canceled assignments with historical sessions.
- [ ] Handles a team with no published assignments.

### Acceptance Criteria

- [ ] One team query provides all data needed by the team KPI strip and assignment list.
- [ ] Team totals and drill-down totals reconcile exactly.
- [ ] Tenant and team isolation remain enforced at the query boundary.

## Milestone 3: Team Dashboard KPI Strip

### Requirements

Give coaches a fast operational summary before assignment detail.

### Implementation Checklist

- [ ] Add a four-column responsive KPI strip above assignment rows.
- [ ] Show `Completion rate` as percentage plus fraction.
- [ ] Show `Athletes needing attention` as a unique-athlete count.
- [ ] Show `Overdue work` as occurrence count.
- [ ] Show `Due now` with started and due-today detail.
- [ ] Show `No due work` when completion-rate denominator is zero.
- [ ] Keep upcoming workload outside the primary KPI strip.
- [ ] Ensure all values update with the selected time window.
- [ ] Add concise accessible descriptions for each KPI.
- [ ] Do not use color as the only indicator of an exception.
- [ ] Avoid decorative progress rings or gauges that obscure exact values.

### Empty and Error States

- [ ] Team with no assignments explains that no compliance data exists.
- [ ] Team with upcoming-only work shows no due work and the upcoming count separately.
- [ ] Query failure retains the existing recoverable error state.
- [ ] Loading layout preserves KPI-strip dimensions to avoid page shift.

### Acceptance Criteria

- [ ] A coach can identify current compliance and required attention without scanning assignment rows.
- [ ] Rates always display their numerator and denominator.
- [ ] Upcoming work cannot inflate or depress completion rate.

## Milestone 4: Assignment Priority Rows

### Requirements

Replace equal-weight status counters with an action-oriented summary while retaining deep-dive navigation.

### Implementation Checklist

- [ ] Show assignment name, source type, schedule, and lifecycle status.
- [ ] Show completion rate and completed/eligible fraction prominently.
- [ ] Show unique athletes needing attention.
- [ ] Show started and due-today counts as due-now context.
- [ ] Show upcoming count as secondary workload context.
- [ ] Replace `Latest activity` with `Latest completion` when a submitted timestamp exists.
- [ ] Show a neutral no-activity label when no completion exists.
- [ ] Sort assignments with overdue attention first.
- [ ] Then sort by due-now work, then upcoming-only work, then assignment name.
- [ ] Use warning styling only when overdue work exists.
- [ ] Keep lifecycle status visually secondary to compliance status.
- [ ] Preserve the assignment-detail link and selected window query parameter.

### Acceptance Criteria

- [ ] Assignment rows can be compared despite different recipient and schedule sizes.
- [ ] Highest-attention assignments appear first by default.
- [ ] Raw status counts remain available through row detail or drill-down.

## Milestone 5: Athlete and Occurrence Drill-Down

### Requirements

Explain every aggregate through athlete-level and occurrence-level detail.

### Implementation Checklist

- [ ] Add per-athlete completion fraction.
- [ ] Add per-athlete overdue count.
- [ ] Add started and due-today context.
- [ ] Keep the occurrence timeline with completed, overdue, started, due today, and upcoming states.
- [ ] Sort athletes by overdue, started, due today, fully compliant, then upcoming-only.
- [ ] Keep submitted-session review links.
- [ ] Keep viewer access read-only.
- [ ] Keep athlete access restricted to athlete-owned routes.
- [ ] Preserve selected-window context while navigating back to team performance.
- [ ] Ensure visible athlete totals reconcile with assignment-row totals.

### Acceptance Criteria

- [ ] Coaches can identify exactly which athlete and occurrence explains each exception.
- [ ] No athlete or result data leaks across team or organization scope.
- [ ] Drill-down totals reconcile with team and assignment summaries.

## Milestone 6: Organization Compliance Read Model

### Requirements

Provide directors with organization-level rollups and team comparison using the same metric definitions as team views.

### Implementation Checklist

- [ ] Add an organization compliance query scoped by active organization.
- [ ] Return organization-wide occurrence counts and summary rates.
- [ ] Return unique athletes needing attention across all teams.
- [ ] Deduplicate athletes assigned through multiple teams.
- [ ] Return programming-coverage numerator and organization-athlete denominator.
- [ ] Return one comparison summary per team.
- [ ] Include team IDs and names for canonical team-performance links.
- [ ] Preserve publish-time team provenance.
- [ ] Exclude inaccessible foreign-organization data.
- [ ] Avoid summing team rates; calculate organization rate from organization numerator and denominator.
- [ ] Define how direct-athlete assignments without a team scope appear at organization level.

### Integration Tests

- [ ] Organization totals use raw occurrence numerators and denominators rather than averaging team percentages.
- [ ] Multi-team athletes are deduplicated in athlete attention and coverage counts.
- [ ] Team comparison totals reconcile with organization totals where scopes overlap.
- [ ] Direct-athlete assignments are handled according to the documented rule.
- [ ] Foreign-organization assignments and sessions are excluded.
- [ ] Window filtering matches team behavior.
- [ ] Zero-due-work organizations return unavailable rates.

### Acceptance Criteria

- [ ] Organization metrics are mathematically consistent with team metrics.
- [ ] Directors can compare teams without size bias.
- [ ] Tenant isolation is enforced in every organization aggregate.

## Milestone 7: Organization Dashboard

### Requirements

Replace the compliance placeholder and demote roster administration counts below performance outcomes.

### Implementation Checklist

- [ ] Add 30-day, 90-day, and all-time controls.
- [ ] Add organization completion rate with fraction.
- [ ] Add teams needing attention with tracked-team denominator.
- [ ] Add unique athletes needing attention.
- [ ] Add programming coverage with fraction.
- [ ] Move teams, athletes, roster entries, and invitation counts into a secondary operational summary.
- [ ] Replace the compliance placeholder card with live metrics.
- [ ] Add a team comparison table or dense list.
- [ ] Show team completion rate and fraction.
- [ ] Show team athletes needing attention.
- [ ] Show team overdue count.
- [ ] Show team started and due-today counts.
- [ ] Show team programming coverage.
- [ ] Sort teams needing intervention first.
- [ ] Link each team row to its canonical team-performance dashboard with the selected window.
- [ ] Avoid trend arrows until equivalent previous-window comparison is implemented.

### Empty and Access States

- [ ] Organization with no teams shows setup guidance.
- [ ] Organization with teams but no due work shows no due work, not 100%.
- [ ] Organization Viewer sees read-only compliance data.
- [ ] Athlete remains unable to access organization performance.
- [ ] Team roles from another organization cannot influence organization metrics.

### Acceptance Criteria

- [ ] Directors can identify which teams require intervention from one screen.
- [ ] Organization rates expose exact denominators.
- [ ] Operational roster counts do not compete visually with compliance outcomes.

## Milestone 8: KPI Definitions and Accessibility

### Requirements

Users must be able to understand and trust every metric without relying on institutional folklore.

### Implementation Checklist

- [ ] Add concise in-product definitions for completion rate, due work, overdue work, and programming coverage.
- [ ] Explain that completion reflects submitted logging, not verified training quality.
- [ ] Explain selected-window behavior.
- [ ] Explain `No due work` and unavailable percentages.
- [ ] Use semantic `dl`, table headers, and status text where appropriate.
- [ ] Ensure keyboard navigation through time filters and drill-down links.
- [ ] Ensure warning states have text or icons in addition to color.
- [ ] Verify mobile layouts do not truncate rates, fractions, or athlete names.
- [ ] Verify screen-reader output includes metric label, value, and denominator.
- [ ] Keep displayed terminology consistent across team, organization, assignment, and athlete views.

### Acceptance Criteria

- [ ] A new coach can interpret each KPI from the interface alone.
- [ ] KPI meaning is consistent across all dashboard levels.
- [ ] Accessibility checks pass for keyboard, focus, semantics, and contrast.

## Milestone 9: Verification and Rollout

### Unit and Integration

- [ ] Compliance summary unit tests pass.
- [ ] Team compliance integration tests pass.
- [ ] Organization compliance integration tests pass.
- [ ] Existing assignment-session and tenant-isolation tests remain green.

### Browser / E2E

- [ ] Team KPI strip renders correct rates and counts for seeded scenarios.
- [ ] Assignment rows prioritize overdue work.
- [ ] Window controls update every KPI consistently.
- [ ] Assignment drill-down reconciles with row totals.
- [ ] Organization KPI strip renders correct aggregate rates.
- [ ] Organization team comparison links to scoped team dashboards.
- [ ] Organization Viewer remains read-only.
- [ ] Athlete cannot access staff or organization KPI routes.
- [ ] Foreign-team and foreign-organization routes fail safely.

### Visual Verification

- [ ] Capture desktop and mobile screenshots of team dashboard.
- [ ] Capture desktop and mobile screenshots of organization dashboard.
- [ ] Verify dense data remains scannable without nested cards.
- [ ] Verify no overlap, truncation, or horizontal overflow.
- [ ] Verify all zero, empty, warning, and normal states.

### Required Repository Checks

- [ ] `npm run validate` passes.
- [ ] `npm run build` passes.
- [ ] Database migrations are not required for Phase 1.
- [ ] Product documentation reflects final implemented formulas and labels.

### Rollout

- [ ] Compare old status counts with new summaries in test fixtures before removing old presentation.
- [ ] Confirm coaches understand `Due today`, `Started`, `Completed`, and `Overdue` terminology.
- [ ] Confirm organization directors prefer weighted organization rates over average team rates.
- [ ] Add product analytics for team-row and athlete-drill-down usage when PostHog is introduced.
- [ ] Do not add configurable thresholds until real usage demonstrates a stable intervention policy.

## Phase 1 Done Definition

- [ ] Team dashboard leads with completion rate and actionable exceptions.
- [ ] Assignment rows use normalized rates and attention counts.
- [ ] Athlete drill-down explains every team-level exception.
- [ ] Organization dashboard rolls up compliance and compares teams.
- [ ] Team and organization metrics share one formula implementation.
- [ ] Every percentage shows or exposes its denominator.
- [ ] Zero-due-work states never display a misleading 100%.
- [ ] Publish-time scope and tenant isolation are preserved.
- [ ] Unit, integration, E2E, accessibility, and visual checks pass.
- [ ] `npm run validate` and `npm run build` pass.

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
