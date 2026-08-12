# Timeliness Policy and Support Guide

## Policy Version 1

Training Tracker snapshots timeliness policy on every assignment so deadlines remain reproducible after application defaults change.

- Fixed workout and fixed-day plan occurrences are due at the exclusive local-midnight boundary after the scheduled date.
- Weekly-frequency targets are due at the exclusive local-midnight boundary after Sunday in the assignment-local week.
- The first completed submission must occur before `due_at` to be on time. Equality is late.
- Late logging is available until the exclusive boundary seven assignment-local calendar days after `due_at`.
- Completed-result edits retain the first `submitted_at` and do not change timeliness classification.
- Assignment timezone and IANA daylight-saving rules determine each instant.

The configured verification environment applied policy version 1 to existing assignments at `2026-08-12 18:11:56.394772+00`. Record the separate production value when the migration is deployed. New assignments snapshot their own `timeliness_policy_effective_at` when created. An occurrence with a deadline before its assignment's effective instant remains visible in Phase 1 compliance but is excluded from timeliness rates and trends.

## Metrics

```text
timelinessEligible = onTimeCompleted + lateCompleted + openOverdue
onTimeCompletionRate = onTimeCompleted / timelinessEligible
lateCompletionRate = lateCompleted / timelinessEligible
averageCompletedLateness = average(firstSubmittedAt - dueAt for lateCompleted)
```

Thirty-day views compare with the immediately preceding non-overlapping 30 days. Ninety-day views use the equivalent preceding 90 days. Changes are percentage-point differences. All-time has no trend.

`No due work` means the current denominator is zero. `Insufficient history` means at least one compared window has no policy-eligible due work.

## Support Diagnostics

Use organization and assignment scope in every diagnostic query. Do not include athlete result payloads in support logs.

Inspect an assignment policy:

```sql
SELECT
  organization_id,
  id AS assignment_id,
  timezone,
  timeliness_policy_version,
  timeliness_policy_effective_at,
  fixed_due_local_minute,
  weekly_due_day,
  weekly_due_local_minute,
  late_entry_days
FROM assignments
WHERE organization_id = :organization_id
  AND id = :assignment_id;
```

Inspect one persisted occurrence without exposing results:

```sql
SELECT
  organization_id,
  assignment_id,
  id AS session_id,
  scheduled_date,
  due_at,
  available_from,
  available_until,
  status,
  submitted_at
FROM assignment_sessions
WHERE organization_id = :organization_id
  AND assignment_id = :assignment_id
  AND id = :session_id;
```

Interpretation:

- `due_at IS NULL`: legacy or pre-policy persisted occurrence; do not report punctuality.
- `submitted_at < due_at`: on-time completion.
- `submitted_at >= due_at`: completed late.
- `submitted_at IS NULL AND due_at <= now()`: open overdue.
- `now() >= available_until`: late-entry window closed.

Virtual occurrences without sessions resolve the same deadline from assignment policy, assignment timezone, schedule type, and occurrence date or week. If persisted and virtual deadlines differ for the same occurrence, treat it as a defect and retain the stored assignment policy values in the incident report.

## Operational Verification

- The migration applies cleanly to empty and representative Phase 1 databases through integration tests.
- Drizzle migration journal reruns do not repeat schema or backfill statements.
- The organization-scoped `assignment_sessions_organization_due_at_idx` supports deadline range reads.
- PostgreSQL selected sequential scans for 30-day and 90-day reads in the small development fixture; inspect production plans again after representative data volume is available.
