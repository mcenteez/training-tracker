# Performance KPI Recommendations

## Purpose

Define the team and organization performance metrics that Training Tracker should present to strength and conditioning coaches, directors, and athletic departments.

Implementation work is tracked in [performance-kpi-implementation-checklist.md](performance-kpi-implementation-checklist.md).

The dashboard should answer three questions in order:

1. **Where does staff attention need to go now?**
2. **Is prescribed training being completed consistently?**
3. **Which teams, assignments, and athletes explain the result?**

The first release should report adherence and operational execution only. It must not imply readiness, injury risk, training load, or exercise quality when those data are not collected.

## Research Summary

Athlete-monitoring literature emphasizes that monitoring must be intuitive, efficient, actionable, and able to report both group and individual responses. No single marker reliably describes fatigue or readiness. Useful monitoring combines multiple measures, evaluates trends, and supports communication and intervention rather than collecting data without a decision pathway.

Common high-performance priorities include:

- Training-program effectiveness and adherence
- Athlete availability and participation
- Fatigue, recovery, illness, and injury risk
- Internal load, commonly session RPE multiplied by duration
- External work completed
- Individual trends rather than universal thresholds
- Fast identification of meaningful exceptions

Training Tracker currently has reliable data for assignment delivery, occurrence status, session start, session submission, athlete/team scope, and timestamps. It does not yet have explicit attendance, medical availability, readiness, RPE, session duration, wellness, or normalized external-load data.

## Product Principle

**Lead with rates and exceptions; retain counts for context.**

Raw counts such as `1 submitted` or `6 upcoming` are difficult to compare across assignments or teams of different sizes. The primary display should normalize completed and overdue work against eligible due work, then expose the raw counts and athlete-level records through drill-down.

## Status Terminology

The current statuses are mutually exclusive per athlete occurrence, but several labels should change in the UI:

| Current     | Recommended | Meaning                                                                 |
| ----------- | ----------- | ----------------------------------------------------------------------- |
| Assigned    | Due today   | Scheduled for today and not completed                                   |
| In progress | Started     | Session started but not submitted                                       |
| Submitted   | Completed   | Athlete submitted results; not a quality or staff-verification judgment |
| Missed      | Overdue     | Past scheduled date without submission                                  |
| Upcoming    | Upcoming    | Scheduled after today                                                   |

Avoid using `missed` as the main operational term. It implies intent or attendance information that the application does not collect.

## Core Formulas

All formulas use occurrence counts inside the selected time window and assignment timezone.

### Eligible Due Work

```text
eligible_due = completed + overdue + started + due_today
```

Upcoming occurrences are excluded because athletes have not yet had an opportunity to complete them.

### Completion Rate

```text
completion_rate = completed / eligible_due
```

Display `—` when `eligible_due = 0`.

### Outstanding Rate

```text
outstanding_rate = (overdue + started + due_today) / eligible_due
```

This is the complement of completion rate and provides an operational queue.

### On-Time Completion Rate

Phase 2 defines an explicit assignment-local due instant, preserves the first submission timestamp, and reports on-time completion separately from late completion and open overdue work. See [timeliness-policy.md](timeliness-policy.md) for the implemented boundary, historical, and late-entry rules.

### Athlete Coverage

```text
athlete_coverage = athletes_with_at_least_one_eligible_occurrence / rostered_athletes
```

This distinguishes programming coverage from execution compliance.

### Engagement Rate

```text
engagement_rate = athletes_with_started_or_completed_work / athletes_with_eligible_due_work
```

This indicates whether athletes have interacted with assigned training, but it does not prove physical attendance.

## Team Dashboard

### Primary KPI Strip

Show four values for the selected 30-day, 90-day, or all-time window:

1. **Completion rate**
   - Percentage and fraction: `82% · 41 of 50 due`
   - Primary measure of execution

2. **Athletes needing attention**
   - Unique athletes with at least one overdue occurrence
   - More actionable than total overdue occurrences

3. **Overdue work**
   - Count of overdue occurrences
   - Include oldest overdue age when available

4. **Due now**
   - Started plus due-today occurrences
   - Split in detail as `3 started · 5 due today`

Upcoming workload should be secondary context, not a compliance KPI.

### Assignment Rows

Replace the five equal-status counters with this hierarchy:

- Assignment name and schedule
- **Completion rate** with fraction
- **Needs attention**: unique athletes overdue
- Due now: started and due today
- Upcoming workload
- Latest meaningful activity

Suggested row:

```text
PPL                                      Published
82% complete · 14 of 17 due
2 athletes need attention · 1 started · 6 upcoming
Latest completion: Aug 12, 8:46 AM
```

Use color only for actionable exceptions:

- Neutral or positive: no overdue work
- Warning: overdue work exists
- Critical: multiple overdue occurrences or persistent athlete-level pattern

Thresholds should remain configurable or descriptive until enough longitudinal data exists. Do not invent sport-wide red/yellow/green cutoffs.

### Team Drill-Down

Clicking an assignment should open:

1. Athlete-level rows sorted by attention priority
2. Each athlete's completion fraction and overdue count
3. Occurrence timeline showing completed, overdue, started, due today, and upcoming
4. Submitted-result review link

Default sort:

1. Overdue athlete
2. Started but not completed
3. Due today
4. Fully compliant
5. Upcoming only

## Organization Dashboard

The organization view serves directors and department leadership. It should compare teams and reveal systemic issues, not repeat roster counts as the primary outcome.

### Primary Organization KPIs

1. **Organization completion rate**
   - Completed occurrences divided by all eligible due occurrences across authorized teams
   - Show denominator and selected window

2. **Teams needing attention**
   - Teams with at least one overdue occurrence
   - Also show total tracked teams

3. **Athletes needing attention**
   - Unique athletes with overdue work across the organization
   - Deduplicate athletes who appear on multiple teams

4. **Programming coverage**
   - Athletes with eligible assigned work divided by organization athletes
   - Prevents a high completion rate from hiding unprogrammed athletes

Keep operational counts such as teams, athletes, roster entries, and invitations in a secondary administration summary.

### Team Comparison Table

Each team row should show:

- Team name
- Completion rate and fraction
- Athletes needing attention
- Overdue occurrences
- Started / due today
- Programming coverage
- Trend versus previous equivalent window, once trend support exists

Default sort should place teams needing intervention first, not alphabetically.

### Organization Drill-Down

```text
Organization
  → Team comparison
    → Assignment
      → Athlete
        → Occurrence and submitted results
```

Every aggregate must retain the active-organization and publish-time team scope already enforced by the compliance queries.

## Important Denominator Rules

1. Exclude upcoming occurrences from completion-rate denominators.
2. Include started and due-today work as eligible but incomplete.
3. Keep canceled assignments visible only for occurrences and sessions that remain historically relevant.
4. Use publish-time recipient/team scope so roster changes do not rewrite history.
5. Deduplicate athlete counts at organization level.
6. Show the numerator and denominator beside percentages.
7. Show `No due work` rather than `100%` when the denominator is zero.

## Data Available Now

Can be implemented with the current model:

- Completed, overdue, started, due today, upcoming counts
- Completion and outstanding rates
- Unique athletes requiring attention
- Athlete programming coverage
- Team comparison and organization roll-up
- Assignment and athlete drill-down
- Latest session activity
- 30-day, 90-day, and all-time windows

## Data Not Available Yet

Do not show these until collection and definitions exist:

- Readiness score
- Injury or illness availability
- Attendance
- Session RPE
- Session duration
- Internal training load
- Normalized external load or strength volume
- Sleep or wellness
- Completion quality or exercise-form quality
- On-time completion rate
- Reliable trend/change flags

The current `load` result is free-form text and cannot be safely summed. A submitted session proves logging completion, not prescribed-quality execution.

## Future Monitoring Roadmap

### Phase 1: Compliance Foundation

- Implement normalized completion rate and attention counts
- Rename status labels
- Add team KPI strip and assignment-priority rows
- Add organization compliance roll-up and team comparison
- Document exact KPI definitions in-product

### Phase 2: Timeliness and Trends

- Resolve explicit occurrence due instants in the assignment timezone
- Report on-time completion, average completed lateness, and open overdue work
- Compare current 30-day and 90-day windows with equivalent previous windows
- Explain trends through athlete, assignment, team, and organization detail
- Add configurable intervention rules

### Phase 3: Availability and Readiness

- Add athlete availability state with reason and effective dates
- Keep medical details restricted and separate from general coaching notes
- Add minimal readiness questionnaire only when staff has a defined action protocol
- Report response compliance separately from readiness status

### Phase 4: Training Load

- Add session duration and session RPE
- Calculate internal load as `duration_minutes × session_RPE`
- Normalize external load fields and units before aggregation
- Compare internal response with prescribed/external work at athlete level
- Prefer rolling individual baselines over universal thresholds

## Recommended First Implementation

Build the compliance foundation using existing data:

1. Add a reusable compliance-summary calculator that rolls assignment results into team and organization summaries.
2. Replace assignment-row status tiles with completion rate and exception counts.
3. Add a team KPI strip above the assignment list.
4. Add organization-wide compliance aggregation and a team comparison table.
5. Preserve the existing assignment → athlete → occurrence drill-down.
6. Add unit and integration tests for denominator rules, multi-team athlete deduplication, cancellation, zero-due-work behavior, and tenant isolation.

## Sources

- Shona L. Halson, “Monitoring Training Load to Understand Fatigue in Athletes,” _Sports Medicine_ 44(Suppl 2), 2014. The review emphasizes individualized monitoring, combined internal/external measures, simple actionable reporting, group and individual views, and the absence of a single definitive fatigue marker: https://pmc.ncbi.nlm.nih.gov/articles/PMC4213373/
- Training Tracker access and historical-scope requirements: [access-control.md](access-control.md)
- Training Tracker product behavior and athlete-result requirements: [app-functionality.md](app-functionality.md)
- Current compliance implementation: `src/modules/assignments/application/team-compliance.ts` and `src/modules/assignments/db/team-compliance-queries.ts`
