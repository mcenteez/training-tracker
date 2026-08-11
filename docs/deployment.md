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
