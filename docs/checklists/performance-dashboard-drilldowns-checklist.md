# Performance Dashboard Drill-Down Checklist

## Objective

Make every actionable metric on Team and Organization Performance dashboards explainable through authorized underlying facts. A staff member must be able to move from a dashboard count or rate to the athletes, assignments, occurrences, and submitted sessions that produce it.

The drill-down system must preserve tenant isolation, team-scoped result access, publish-time recipient-to-team scope, selected-window semantics, and the existing distinction between operational compliance metrics and descriptive training-load metrics.

Reference foundations:

- [performance-kpi-implementation-checklist.md](performance-kpi-implementation-checklist.md)
- [performance-kpi-phase-2-timeliness-trends-checklist.md](performance-kpi-phase-2-timeliness-trends-checklist.md)
- [performance-kpi-phase-4-training-load-checklist.md](performance-kpi-phase-4-training-load-checklist.md)
- [../access-control.md](../access-control.md)

## Product Policy

### Drill-Down Principles

- A dashboard metric must show a visible, keyboard-accessible command that opens its facts. Do not make a whole metric card an undiscoverable link.
- A drill-down must state its metric, scope, selected window, denominator where applicable, and current request-level `asOf` instant.
- A dashboard total and its drill-down count must reconcile from the same authorized raw facts.
- Continue using existing team assignment detail and submitted-session review routes as the final levels of navigation.
- Use neutral, factual language. Drill-downs must not rank athletes, label readiness, or infer injury risk.
- Return factual empty states such as `No open overdue occurrences in this window`; do not substitute zero work for unavailable training-load values.

### Access and Scope Rules

- Every Team drill-down independently resolves `results.read.all` through `loadAuthorizedTeamContext`.
- Organization Owners, Managers, and Viewers can read only their active organization drill-downs. Athletes cannot access staff performance drill-downs.
- Team Managers and Team Viewers can read only facts tied to their authorized team.
- Team drill-downs use persisted recipient-to-team scope at assignment publication. Later roster changes neither broaden nor erase permitted historical result visibility.
- Organization drill-downs include direct-athlete assignments; team drill-downs exclude them unless a persisted team scope exists.
- Client query parameters may select only an allowlisted metric, window, and documented tab. They never establish organization, team, athlete, assignment, or session access.

### Route Model

Use one route per scope with a strict server-side metric enum:

- `/app/performance/teams/[teamId]/drilldown?metric=<metric>&window=30&tab=<tab>`
- `/app/performance/organization/drilldown?metric=<metric>&window=30&tab=<tab>`

Existing linked detail routes remain authoritative:

- `/app/performance/teams/[teamId]/assignments/[assignmentId]`
- `/app/performance/teams/[teamId]/assignments/[assignmentId]/sessions/[sessionId]`

## Metric Inventory

### Team Dashboard

| Metric                     | Drill-down facts                                                                                           | Default sort                                | Primary destination                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| Completion rate            | Eligible due occurrences by athlete and assignment, with completed, overdue, started, and due-today states | Overdue, started, due-today, scheduled date | Assignment detail                     |
| Athletes needing attention | Athletes with one or more open overdue occurrences                                                         | Overdue count, oldest due date              | Assignment detail filtered to athlete |
| Overdue work               | Open overdue occurrences with due date and age                                                             | Oldest due instant                          | Assignment detail                     |
| Due now                    | Started and due-today occurrences                                                                          | Started, then scheduled date                | Assignment detail                     |
| On-time completion         | Timeliness-eligible occurrences split by on-time, late, and open overdue                                   | Late/open overdue first                     | Assignment detail                     |
| Equivalent-window change   | Current and previous equivalent-window timeliness cohorts and raw counts                                   | Assignment, athlete, due date               | Assignment detail                     |
| Average completed lateness | Late-completed occurrences with lateness duration                                                          | Longest lateness                            | Submitted-session review              |
| Open overdue               | Open overdue occurrences and oldest due instant                                                            | Oldest due instant                          | Assignment detail                     |
| Capture coverage           | Submitted sessions with duration/RPE available or missing                                                  | Missing fields, scheduled date              | Submitted-session review              |
| Internal load total        | Submitted sessions with raw duration, RPE, and derived internal load                                       | Scheduled date                              | Submitted-session review              |
| Measurable strength volume | Comparable, partial, and unavailable external-work sessions                                                | State, scheduled date                       | Submitted-session review              |

### Organization Dashboard

| Metric                     | Drill-down facts                                                                           | Default grouping                  | Primary destination                   |
| -------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------- |
| Completion rate            | Eligible due occurrences across authorized teams and direct-athlete assignments            | Team, assignment, athlete         | Team drill-down or assignment detail  |
| Teams needing attention    | Teams with open overdue occurrences                                                        | Overdue athletes, oldest due date | Team dashboard                        |
| Athletes needing attention | Unique athletes with open overdue occurrences                                              | Team, athlete, oldest due date    | Team drill-down                       |
| Programming coverage       | Rostered athletes with and without eligible due work                                       | Team, athlete                     | Team dashboard or team management     |
| Team compliance rows       | Existing team-level compliance, timeliness, and coverage facts                             | Attention, overdue, due now       | Existing team dashboard               |
| Capture coverage           | Submitted sessions with missing or valid duration/RPE across authorized organization facts | Team, capture state               | Team drill-down or session review     |
| Internal load total        | Raw submitted duration/RPE/internal-load facts                                             | Team, assignment, athlete         | Team drill-down or session review     |
| Measurable strength volume | Comparable, partial, unavailable session facts                                             | Team, external-work state         | Team drill-down or session review     |
| Organization operations    | Athlete, roster-entry, and pending-invitation counts                                       | N/A                               | Existing team/admin operations routes |

## Shared Contract

### Allowed Metric Values

- [x] Define a shared `PerformanceDrilldownMetric` union for compliance, timeliness, and training-load facts.
- [x] Define allowed tabs per metric, such as `all`, `completed`, `openOverdue`, `onTime`, `late`, `available`, `missing`, `comparable`, `partial`, and `unavailable`.
- [x] Parse `metric`, `window`, and `tab` with Zod at the route boundary.
- [x] Reject invalid metric or tab combinations with safe not-found behavior.
- [x] Preserve `30`, `90`, and `all` window semantics from existing dashboards.
- [x] Capture one request-level `asOf` instant and pass it through summary and drill-down reads.

### Common Row Shape

- [x] Return a discriminated row payload with `metric` as its kind.
- [x] Include athlete, assignment, session, occurrence, scheduled date, and publish-time team-scope references only when applicable.
- [ ] Include raw values beside every derived display value: numerator/denominator, due instant, submission instant, duration, RPE, entered unit, normalized kilograms, and sample count.
- [ ] Include a structured unavailable reason rather than a fabricated zero for missing load metrics.
- [x] Keep drill-down query results module-owned and server-only.

### Reconciliation

- [x] Add reusable reconciliation assertions that the dashboard numerator, denominator, count, or total equals the corresponding drill-down facts.
- [ ] Preserve direct-athlete organization facts and exclude them from a team drill-down without persisted scope.
- [x] Deduplicate athlete counts only where the source dashboard metric is explicitly unique-athlete based.
- [ ] Never reconstruct team or organization totals by averaging athlete rates or baseline percentages.

## Milestone 1: Team Compliance Drill-Downs

### Requirements

Deliver the most operationally useful team drill-downs first, reusing existing assignment detail and occurrence routes for final navigation.

### Implementation Checklist

- [x] Add the Team drill-down route and authorize it with `results.read.all`.
- [x] Add a module-owned Team compliance/timeliness drill-down query scoped by organization, team, selected window, and `asOf`.
- [x] Implement `completion` facts for completed, overdue, started, and due-today eligible occurrences.
- [x] Implement `attention` facts for athletes with open overdue occurrences and their oldest overdue date.
- [x] Implement `overdue` facts for open overdue occurrences.
- [x] Implement `dueNow` facts for started and due-today occurrences.
- [x] Reuse persisted recipient-to-team scope for every result and occurrence read.
- [x] Add a factual empty state for every metric and tab.
- [x] Add links from the Team KPI strip with explicit labels such as `View overdue occurrences`.
- [x] Add links from the team assignment list only when the row can provide a more specific assignment context.

### Drill-Down UI

- [x] Show metric title, selected window, and fact count before the table/list.
- [x] Use a responsive table on wide viewports and a readable stacked row layout on narrow viewports.
- [x] Include athlete name, assignment name, scheduled date, status, and due context on every occurrence row.
- [x] Link every row to the existing assignment detail; link submitted rows to session review where applicable.
- [x] Keep filters as tabs or fixed controls with stable URL state.
- [x] Preserve keyboard focus, visible focus rings, semantic headings, table headers, and useful accessible names.

### Tests

- [x] Team completion drill-down count matches completion KPI numerator and denominator.
- [x] Attention drill-down deduplicates athletes while overdue drill-down retains every overdue occurrence.
- [x] Team Manager, Team Viewer, organization-wide staff, athlete, unmanaged team, and foreign organization access behave safely.
- [x] Removed roster members remain visible only through permitted publish-time assignment history.
- [x] Mobile layout does not overflow with long athlete or assignment names.

### Acceptance Criteria

- [x] A coach can move from completion, attention, overdue, or due-now KPIs to the facts producing that number.
- [x] Every occurrence row leads to an existing authorized assignment or submitted-session detail surface.
- [x] Team totals and returned facts reconcile exactly.

## Milestone 2: Team Timeliness Drill-Downs

### Requirements

Explain on-time completion, lateness, overdue work, and equivalent-window changes with raw due and submission facts.

### Implementation Checklist

- [x] Extend the Team drill-down query with on-time, late-completed, and open-overdue fact modes.
- [x] Include due instant, first submission instant, lateness duration, and overdue duration where applicable.
- [x] Add an `onTime` drill-down from the on-time completion card with `all`, `onTime`, `late`, and `openOverdue` tabs.
- [x] Add a `lateCompleted` drill-down from average completed lateness.
- [x] Reuse open-overdue facts from Milestone 1 rather than creating a conflicting calculation.
- [x] Add an equivalent-window comparison view that shows current and previous raw cohorts and counts.
- [x] Keep all-time trend behavior factual: no previous-window cohort exists.

### Tests

- [x] On-time, late, and open-overdue drill-down rows reconcile with timeliness summary counts.
- [x] Equivalent-window current and previous cohorts match the dashboard comparison inputs.
- [x] Due instant and submission instant display in the assignment timezone.
- [x] No-due-work and insufficient-history states remain distinct.

### Acceptance Criteria

- [x] A coach can identify the actual late or open occurrences behind a timeliness card.
- [x] A coach can inspect the occurrence facts behind an equivalent-window change without interpreting it as a risk score.

## Milestone 3: Team Training-Load Drill-Downs

### Requirements

Explain load capture and descriptive totals through submitted-session facts without presenting training load as a diagnosis.

### Implementation Checklist

- [x] Extend the Team training-load query with session-level drill-down facts from the existing authorized load read model.
- [x] Add a capture coverage drill-down with `available`, `missingDuration`, `missingRpe`, and `missingBoth` tabs.
- [x] Add an internal-load drill-down showing duration, RPE, derived internal load, scheduled date, athlete, and assignment.
- [x] Add an external-work drill-down with `comparable`, `partial`, and `unavailable` tabs.
- [x] Show completed and prescribed volume only for comparable sessions.
- [x] Show raw entered load/unit and normalized kilograms on staff rows when measurable.
- [x] Show factual unavailable reasons and measurable-row counts for partial/unavailable sessions.
- [x] Link every submitted-session row to existing staff session review.
- [x] Do not show athlete-to-athlete rankings, thresholds, readiness labels, or injury-risk language.

### Tests

- [x] Capture coverage facts reconcile with available and not-captured dashboard counts.
- [x] Internal-load total equals the sum of drill-down raw internal loads.
- [x] Measurable completed strength volume equals the sum of comparable drill-down volumes.
- [x] Partial and unavailable rows remain separate and never contribute fabricated volume.
- [x] Team Viewer can read allowed drill-down facts but cannot mutate sessions or prescription overrides.

### Acceptance Criteria

- [x] A coach can explain each Team training-load total through submitted sessions and their raw values.
- [x] Missing capture and unmeasurable external work are visible as data-quality states, not zero work.

## Milestone 4: Organization Drill-Downs

### Requirements

Provide organization-wide explainability while preserving Team and direct-athlete assignment boundaries.

### Implementation Checklist

- [x] Add the Organization drill-down route and independently authorize it for organization staff/viewer access.
- [x] Implement organization completion, attention, overdue, due-now, timeliness, capture, internal-load, and external-work drill-down metrics.
- [x] Group organization rows by team when a persisted team scope exists.
- [x] Mark direct-athlete assignment rows as organization-only rather than inventing a team association.
- [x] Link team-scoped rows to the team drill-down with the same metric, window, and relevant tab when possible.
- [x] Link submitted-session rows to existing team session review only when a permitted team scope exists.
- [ ] Link organization operations counts to existing team/admin management surfaces rather than exposing performance facts through administrative mutations.
- [x] Add metric links from organization KPI cards, team rows, and training-load cards.

### Tests

- [x] Organization facts reconcile with KPI totals and the sum of permitted team/direct facts.
- [x] Direct-athlete assignments appear only in organization drill-downs unless a persisted team scope exists.
- [x] Foreign organizations, foreign teams, athletes, and unmanaged Team Managers cannot access or infer drill-down facts.
- [x] Organization Viewer behavior remains read-only.

### Acceptance Criteria

- [x] A director can move from an organization metric to team and athlete facts without losing scope or window context.
- [x] Organization drill-downs never imply a peer ranking or expose an unauthorized team.

## Milestone 5: Polish, Reconciliation, and Rollout

### Implementation Checklist

- [x] Add an explicit drill-down definition section to [../app-functionality.md](../app-functionality.md).
- [x] Add metric definitions and unavailable-state copy that match existing compliance, timeliness, and training-load contracts.
- [x] Add dashboard-to-drill-down link labels for every supported metric.
- [x] Verify all links preserve selected window and valid tab state.
- [x] Add loading, empty, error, and disabled states for every drill-down route.
- [x] Verify mobile and desktop screenshots for Team and Organization routes.
- [x] Verify screen-reader labels include metric, scope, selected window, count, unit, and unavailable reason where applicable.
- [x] Add query-plan checks and indexes only for demonstrated slow drill-down access patterns.
- [x] Document any forward-safe migration or index remediation needed after production volume is observed.

### Required Verification

- [x] Focused unit tests for metric/tab parsing and reconciliation helpers pass.
- [x] Team and Organization integration tests cover tenant isolation, publish-time scope, direct-athlete behavior, and summary reconciliation.
- [x] Playwright tests cover dashboard links, fact lists, detail navigation, Viewer access, athlete denial, and mobile layouts.
- [x] `npm run validate` passes.
- [x] `npm run build` passes.

## Deferred

- AI chat or natural-language query access. Add only after drill-down routes establish trusted, bounded, authorized fact APIs.
- Ad hoc user-configurable metrics, unrestricted filtering, CSV exports, or query builders.
- Athlete ranking, cohort comparisons, readiness scores, injury-risk language, or universal threshold alerts.
- Drill-downs for invitations and roster counts beyond links to existing operational management surfaces.
- Automated intervention recommendations.
