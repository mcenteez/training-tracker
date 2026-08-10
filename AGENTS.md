<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Training Tracker Engineering Guide

## Product Context

Training Tracker is a multi-tenant SaaS application for strength and conditioning organizations. Directors and coaches manage teams, athletes, workouts, assignments, and compliance. Athletes use a mobile-first workflow to view workouts, record results, and track progress.

Treat tenant isolation, authorization, data integrity, accessibility, and offline-safe workout logging as core requirements rather than follow-up enhancements.

## Working Agreements

- Use npm and the Node/npm versions pinned in `package.json` and `.nvmrc`.
- Make narrowly scoped changes that follow existing patterns. Do not refactor unrelated code.
- Prefer established libraries and platform APIs over custom infrastructure.
- Do not add a dependency without explaining why the existing stack cannot reasonably solve the problem.
- Keep secrets and environment-specific values out of source control. Document new environment variables in a committed example file without real values.
- Preserve backward compatibility unless the task explicitly requires a breaking change.
- Update relevant documentation when commands, configuration, architecture, or operational behavior changes.

## Architecture

- Maintain a modular monolith. Organize code by business capability, with explicit boundaries between modules.
- Keep route files and React components thin. Put business rules in server-side domain or application modules that can be tested independently.
- Keep database access behind module-owned repositories or query functions. Do not issue ad hoc database queries from UI components.
- Share code only when it represents a genuinely common concept. Avoid generic `utils` modules that become implicit dependencies between features.
- Use the `@/*` alias for imports from `src` when it improves clarity.
- Keep server-only code out of client bundles. Mark server-only modules appropriately and never expose secrets through `NEXT_PUBLIC_*` variables.

## Next.js And React

- Use the App Router and Server Components by default. Add `"use client"` only at the smallest boundary that requires browser APIs, local state, effects, or event handlers.
- Perform reads on the server when practical. Use Server Actions or route handlers for mutations according to the relevant Next.js 16 guidance.
- Treat request APIs and other Next.js APIs as version-specific; consult the bundled documentation required above before implementation.
- Use React 19 patterns supported by the installed versions. Do not introduce memoization or effects without a concrete need.
- Provide explicit loading, empty, error, and disabled states for user-facing asynchronous workflows.
- Design athlete workflows mobile-first and all administrative workflows responsively. Preserve keyboard access, visible focus, semantic HTML, and useful accessible names.
- Use the established Tailwind CSS and component-system conventions. Reuse shared components before creating near-duplicates.

## Data And Tenant Isolation

- Every tenant-owned record must carry or derive an organization identifier through a documented ownership chain.
- Scope every tenant-owned read and write by the authenticated organization on the server. Never trust an organization, role, athlete, or team identifier supplied by the client without authorization checks.
- Centralize tenant-aware query and authorization patterns so secure behavior is the default.
- Enforce important invariants in both application validation and database constraints where possible.
- Use transactions for operations that must succeed or fail as a unit.
- Database migrations must be forward-safe, reviewable, and compatible with deployed application behavior. Never rewrite an applied migration.
- Avoid logging sensitive athlete data, authentication material, generated workout prompts, or raw request payloads unless explicitly sanitized.

## Validation And Errors

- Validate untrusted input at the server boundary with Zod. Client validation may improve usability but does not replace server validation.
- Return structured, actionable errors without leaking internal details.
- Authorize every mutation independently of UI visibility.
- Make background jobs idempotent and safe to retry. Include tenant context explicitly in job payloads and revalidate authorization-relevant state when the job executes.
- Validate AI structured output deterministically before storing or assigning it. Treat model output as untrusted input and retain a safe failure path.

## Testing

- Add or update tests for changed behavior. Prefer behavior-focused assertions over implementation details.
- Use Vitest and Testing Library for unit and component tests. Use Playwright for critical browser workflows once its infrastructure is present.
- Include tenant-isolation and authorization tests for tenant-owned data paths.
- Include regression coverage when fixing a bug.
- Do not claim a check passed unless it was run successfully in the current environment.

## Required Checks

Run the narrowest relevant test while developing. Before considering a change complete, run:

```bash
npm run validate
npm run build
```

`npm run validate` checks formatting, ESLint, TypeScript, and Vitest. Report any check that could not be run and why.

## Planned Stack

The intended platform includes PostgreSQL with Drizzle ORM, Clerk, Trigger.dev, OpenAI structured outputs, Serwist, Dexie, Recharts, Resend, PostHog, Sentry, shadcn/ui with Radix UI, and Lucide icons. Introduce these incrementally when a concrete requirement needs them; do not build speculative integrations.
