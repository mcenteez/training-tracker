# Production Deployment Guide

This guide defines a safe production deployment workflow for Training Tracker.

## Goals

- Keep production releases repeatable and auditable.
- Ensure every release passes format, lint, type-check, tests, and build.
- Run database migrations in a controlled release step.
- Support AI-assisted and MCP-assisted release operations without exposing secrets.

## Recommended Hosting Stack

- App hosting: Vercel (Next.js App Router runtime)
- Database: Neon PostgreSQL
- Authentication: Clerk
- Source control and automation: GitHub + GitHub Actions

## Environment Variables

Required runtime variables:

- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Use distinct values per environment:

- Local development
- Preview/staging
- Production

Do not reuse production credentials in preview or local environments.

## Required GitHub Secrets For Deploy Workflow

- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Vercel Project Discovery

If Vercel org/project identifiers are unknown, run locally after logging into Vercel:

```bash
npx vercel login
npx vercel link
```

Then copy IDs from `.vercel/project.json`:

- `orgId` -> GitHub secret `VERCEL_ORG_ID`
- `projectId` -> GitHub secret `VERCEL_PROJECT_ID`

## Release Workflow

1. Open a pull request with scoped changes.
2. CI validates formatting, linting, typing, tests, and build.
3. Merge only after CI passes and review is complete.
4. Trigger the release workflow manually with `workflow_dispatch`.
5. Run database migrations before deployment.
6. Deploy application artifact to production.
7. Run smoke checks and log release notes.

## Migration Safety Rules

- Prefer additive or backward-compatible schema changes.
- Never rewrite already-applied migration files.
- Treat migration failures as release blockers.
- For rollback, use a forward fix migration instead of destructive rollback.

## Prepared Assignment Lifecycle Rollout

The prepared assignment lifecycle adds an enum value and nullable audit columns in `20260815143619_elite_ricochet`.

1. Apply the additive migration before deploying application instances that read or write `prepared` assignments.
2. Deploy the application as one coordinated version. Do not keep old instances that publish directly from `draft` alongside new instances that require `prepared`.
3. Verify assignment lists load for authorized staff before enabling assignment mutations.
4. Prepare a draft and confirm it remains absent from athlete assignment lists and performance facts.
5. Save an individual prescription, publish, and confirm the athlete sees the reviewed effective value.
6. Verify a roster addition is reported but not silently added, and an ineligible prepared recipient blocks publication.
7. Recover a failed publication by correcting eligibility or scope and retrying the prepared assignment. Return to draft only when source, schedule, targets, or the resolved audience must change; this discards prepared prescriptions.

If correction is required after release, ship a forward migration or application fix. Existing published and canceled assignments require no backfill, and preparation timestamps must not be fabricated.

## AI and MCP Usage

Good candidates for AI/MCP:

- Drafting deployment PRs and runbooks
- Updating release checklists
- Summarizing CI failures and deploy logs
- Opening and routing release issues/PRs

Keep human approval required for:

- Secret creation and rotation
- Production access control changes
- Final go/no-go release decisions

## GitHub Actions Expectations

- `CI` workflow blocks merges when quality gates fail.
- `Deploy` workflow is manually triggered and always runs migrations before deploy.

## MCP Integration Notes

- GitHub MCP integration is available and useful for release PRs, reviews, status checks, and operational issue workflows.
- If you install a Vercel MCP integration, this deployment process can also be driven through MCP for deployment status and environment automation.
- Until Vercel MCP is connected, GitHub Actions + Vercel CLI remains the authoritative deploy path.

## Pre-Release Checklist

1. `npm ci`
2. `npm run validate`
3. `npm run build`
4. Confirm production secrets exist in GitHub/Vercel.
5. Confirm migration impact and lock window, if applicable.

## Post-Release Checks

1. Home/app route loads for authenticated users.
2. Organization and team workflows load successfully.
3. Library pages (exercises, workouts, plans) load and mutate as expected.
4. Error monitoring shows no spike in failures.

## Phase 4 Training-Load Rollout

Release training-load capture before using aggregate totals operationally:

1. Apply the additive load migrations and deploy capture fields with summaries treated as descriptive preview data.
2. Verify legacy free-text loads remain readable and excluded from measurable volume.
3. Monitor duration capture, session RPE capture, structured-load adoption, partial external work, and unavailable external work as separate rates from compliance.
4. Review missing-data and unit-adoption patterns with coaches before broadening external-work metrics.
5. Treat individual 28-day baseline differences as descriptive history only. Do not configure alerts, intervention thresholds, readiness labels, or injury-risk classifications without a separately reviewed policy.

Coach rollout guidance must explain that internal load is duration multiplied by session RPE, and that baseline differences compare an athlete only with their own eligible preceding sessions. Athlete guidance must explain whole-minute duration, the CR10 session RPE scale, optional capture, and the difference between numeric `kg`/`lb` loads and free-text loads such as bodyweight or bands.

If a load migration or query needs correction after release, ship a forward remediation migration. Do not roll back by dropping nullable columns or rewriting applied migrations. Keep old application instances compatible with nullable fields during the correction window, pause interpretation of affected summaries, verify tenant-scoped counts against raw session facts, and resume only after `npm run validate`, `npm run build`, and production smoke checks pass.

Post-release smoke checks for training load:

1. Athlete saves, reloads, submits, and edits optional duration/RPE and numeric load values.
2. Legacy free-text load remains readable without a fabricated volume.
3. Team Viewer can read authorized detail but cannot mutate it.
4. Team summaries exclude direct-athlete assignments without persisted team scope; organization summaries include them.
5. No logs or error payloads contain raw duration, RPE, entered load, normalized load, or athlete result payloads.
