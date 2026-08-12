# Library Import Implementation Checklist

## Objective

Let a user with library management access bulk-import exercises, workouts, and plans from a JSON file. The primary workflow is a coach asking an AI assistant to generate programming against a published JSON Schema, then uploading the result into Training Tracker.

The import must be predictable and safe: the user sees exactly what will be created before anything is written, and a file that fails validation writes nothing.

JSON is the only supported format. The nested exercise/block/item and plan/slot structures map directly to JSON, a machine-readable JSON Schema can be published for agents to validate against, and a single format means one parser, one validator, and one document to keep correct.

## Scope

- A published, versioned JSON import format for exercises, workouts, and plans.
- A publicly addressable JSON Schema document that AI agents and editors can fetch and validate against.
- A copyable prompt/format reference page the coach can paste into an AI tool.
- Upload, parse, validate, and preview (dry run) with per-entity diagnostics.
- Name-based reference resolution for workout exercises and plan workouts.
- All-or-nothing commit inside a single database transaction.
- Tenant isolation and library-manage authorization enforced server side.
- Unit, component, and Playwright coverage.

## Out Of Scope

- CSV, spreadsheet (`.xlsx`), and ZIP formats.
- Updating or overwriting existing records. Version 1 creates only.
- Media or video upload.
- Background/queued processing for very large files.
- Import history, audit records, or undo.
- Direct AI generation inside the app.

## Product Decisions

### Reference Model

- The file never contains UUIDs. Workout items reference an exercise **by name**; plan slots reference a workout **by name**.
- References resolve against every entity in the file and against existing organization records. Order within the file does not matter, because exercises are always created before workouts and workouts before plans.
- Name matching is case-insensitive and trim-normalized, mirroring the database's `lower(name)` partial unique indexes.
- Exercises resolve against `status = 'active'`. Workouts resolve against `status <> 'archived'`.
- An unresolved reference is a validation error, never a silent create.

### Conflict Handling

- Default strategy is `skip`: a top-level entity whose name already exists is reported as skipped and not created. Its dependents may still reference it.
- A skipped entity produces a `warning`-severity diagnostic with code `already_exists`. Warnings never block commit; they appear in the same diagnostics list as errors, visually separated by severity, so the user cannot miss that something they authored was not created.
- Alternate strategy is `fail`: any existing name aborts the import.
- Duplicate names **within** the file are always an error, regardless of strategy.
- No `update` or `overwrite` strategy in version 1.

### Unresolved References

- A plan slot referencing a workout that is neither defined in the file nor present in the library is an error. Version 1 does not auto-create placeholder drafts, because a silently-created empty workout would be assignable to athletes and would occupy the name, blocking a later real import of the same workout.
- The same rule applies to workout items referencing an unknown exercise.

### Transactionality

- Validation is a complete pass over the whole file. All diagnostics are reported at once, not first-error-only.
- Commit runs in one transaction covering exercises, then workouts, then plans, in dependency order.
- Any failure rolls back the entire import.

### Ordering

- `position` for workout blocks, workout items, and plan schedule slots is derived from array order. A `position` key is rejected as an unknown key.

### Created Status

- Imported exercises are created `active`, matching the only status a new exercise can have.
- Imported workouts and plans are created `draft`. An import is unreviewed content, and a draft cannot be assigned to athletes until a coach opens and activates it.

### Limits

Enforced during parsing and surfaced in the format documentation:

| Limit                   | Value  |
| ----------------------- | ------ |
| Upload size             | 512 KB |
| Exercises per file      | 500    |
| Workouts per file       | 200    |
| Plans per file          | 50     |
| Blocks per workout      | 30     |
| Items per block         | 50     |
| Schedule slots per plan | 300    |

Existing per-entity Zod limits (name 2–120 chars, description ≤ 2000, rounds ≤ 100, weekly target 1–14) apply unchanged.

## Format Specification

### `formatVersion`

Every file declares `"formatVersion": 1`. Unknown versions are rejected with an explicit message.

### Published JSON Schema

The Zod bundle schema is the single source of truth. The JSON Schema document is **generated** from it with Zod 4's built-in `z.toJSONSchema()` so the published contract cannot drift from the validator.

```ts
// src/modules/library-import/application/json-schema.ts
import { z } from "zod";
import { libraryImportBundleSchema } from "./bundle-input";

export const LIBRARY_IMPORT_SCHEMA_PATH = "/schemas/library-import/v1.json";

export function buildLibraryImportJsonSchema(origin: string) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${origin}${LIBRARY_IMPORT_SCHEMA_PATH}`,
    title: "Training Tracker library import bundle",
    ...z.toJSONSchema(libraryImportBundleSchema, {
      target: "draft-2020-12",
      io: "input",
    }),
  };
}
```

Served from a public route handler at `src/app/schemas/library-import/v1.json/route.ts`, generated **at request time** so the published contract always matches the validator actually deployed:

- `GET` returns `application/schema+json` with `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.
- The route is outside the `(app)` group and performs no auth calls, so it is reachable by an unauthenticated agent. Verify against `src/proxy.ts` — the matcher's `js(?!on)` clause means `.json` paths **do** pass through `clerkMiddleware()`, which is fine because plain `clerkMiddleware()` does not protect routes, but confirm no protection is added later without excluding this path.
- Set `Access-Control-Allow-Origin: *` so browser-based agents can fetch it.
- Version in the path, never in a query string. A breaking change ships as `v2.json`; `v1.json` stays served.

Usage:

- Uploaded files may include `"$schema": "https://<host>/schemas/library-import/v1.json"`. The Zod schema must allow (and ignore) this key despite being otherwise `.strict()`.
- The format reference page links the schema URL and includes it in the copyable AI prompt template, so an agent can fetch and self-validate before returning output.
- `io: "input"` matters: several fields use Zod transforms, and the published contract must describe accepted input, not post-transform output.

#### Caveats

- `z.toJSONSchema()` cannot represent arbitrary `.refine()` predicates. Two rules are lost in translation and must be documented in prose next to the schema, and remain enforced server side: the workout-item "at least one prescription or note" refinement, and the plan-slot `fixed_day` / `weekly_frequency` XOR. The XOR is partially recoverable by keeping `planScheduleSlotInputSchema` a `discriminatedUnion`, which converts to a clean `oneOf`.
- Add a unit test asserting the generated document is stable and contains the expected top-level properties, so an accidental Zod refactor that silently changes the public contract fails CI.

### Bundle Shape

```json
{
  "$schema": "https://<host>/schemas/library-import/v1.json",
  "formatVersion": 1,
  "exercises": [
    {
      "name": "Back Squat",
      "instructions": "Brace, sit between the hips, drive through midfoot.",
      "category": "strength",
      "equipment": ["barbell", "rack"],
      "videoUrl": "https://example.com/back-squat"
    }
  ],
  "workouts": [
    {
      "name": "Lower Body A",
      "description": "Week 1 primary lower session.",
      "blocks": [
        {
          "type": "straight",
          "label": "Primary",
          "rounds": 1,
          "items": [
            {
              "exercise": "Back Squat",
              "reps": 5,
              "load": "75%",
              "restSeconds": 180,
              "tempo": "31X1",
              "notes": null
            }
          ]
        }
      ]
    }
  ],
  "plans": [
    {
      "name": "Offseason Base",
      "description": "Four-week base block.",
      "scheduleSlots": [
        {
          "workout": "Lower Body A",
          "scheduleType": "fixed_day",
          "dayOfWeek": "monday",
          "label": "Main lift day"
        },
        {
          "workout": "Conditioning A",
          "scheduleType": "weekly_frequency",
          "targetSessionsPerWeek": 2,
          "label": null
        }
      ]
    }
  ]
}
```

- All three top-level arrays are optional; at least one must be non-empty.
- Optional string fields accept `null` or omission. Unknown keys are rejected (`.strict()`) so AI-invented fields surface as errors instead of being silently dropped.
- `scheduleType: "fixed_day"` requires `dayOfWeek` and forbids `targetSessionsPerWeek`. `scheduleType: "weekly_frequency"` requires `targetSessionsPerWeek` and forbids `dayOfWeek`. This mirrors the `plan_schedule_slots_schedule_shape` database check.

Parsing rules: UTF-8, optional BOM stripped, `JSON.parse` inside a try/catch that reports a syntax error as a single diagnostic. The top-level value must be an object.

## Architecture

New module `src/modules/library-import/`, following the existing `application/` + `db/` split.

```
src/modules/library-import/
  application/
    format.ts            # formatVersion, limits, shared constants
    bundle-input.ts      # Zod schemas for the bundle (pure, no server-only)
    bundle-input.test.ts
    json-schema.ts       # generated JSON Schema document
    json-schema.test.ts
    diagnostics.ts       # ImportDiagnostic type, severity, location formatting
    import-plan.ts       # reference resolution, dedupe, conflict strategy -> ImportPlan
    import-plan.test.ts
    import-service.ts    # authorization guard + transactional commit
    import-service.test.ts
  db/
    queries.ts           # existing active exercise / unarchived workout name lookups
    unit-of-work.ts      # ImportUnitOfWork: single transaction across all three entities
```

Key types:

```ts
export interface ImportDiagnostic {
  severity: "error" | "warning";
  entity: "exercise" | "workout" | "plan";
  location: string; // JSON path, e.g. "workouts[2].blocks[0].items[1].exercise"
  code: string; // "duplicate_name" | "unknown_exercise" | "already_exists" | ...
  message: string;
}

export interface ImportPlan {
  formatVersion: number;
  exercises: PlannedExercise[]; // action: "create" | "skip_existing"
  workouts: PlannedWorkout[];
  plans: PlannedPlan[];
  diagnostics: ImportDiagnostic[];
  canCommit: boolean; // no error-severity diagnostics and at least one create
}
```

`buildImportPlan` is a pure function taking the parsed bundle plus a snapshot of existing names, so it is fully unit-testable without a database.

### Authorization

- The route reuses `loadLibraryAppContext()` and requires `libraryAccess === "manage"`.
- The commit transaction independently re-resolves the actor role using the same `findOrganizationRole` / `listTeamRoles` / `resolveLibraryAccess` guard the exercise, workout, and plan services already use.
- `organizationId` and `actorUserId` come only from server context. Any `organizationId` present in an uploaded file is rejected as an unknown key.

### Data Access

`ImportUnitOfWork.transaction` exposes one transaction with:

- `findOrganizationRole` / `listTeamRoles`
- `listActiveExerciseNames(organizationId)`
- `listUnarchivedWorkoutNames(organizationId)`
- `createExercises(input)` — batch insert, returns `{ id, name }[]`
- `createWorkoutGraph(input)` — reuses the existing block/item insert shape
- `createPlan(input)`

Names read during preview are re-read inside the commit transaction so a concurrent create cannot slip past the preview snapshot.

## UI

Route: `/app/library/import`, added to `library-nav.tsx`, visible only when `libraryAccess === "manage"`.

Three stages on one page:

1. **Format reference** — collapsible section with the schema URL, an annotated example bundle, enum values, limits, and a copy-to-clipboard "AI prompt template" block that instructs an assistant to fetch the schema and emit exactly this format.
2. **Input** — one form offering two equivalent sources, since agents frequently return JSON in chat rather than as a downloadable file:
   - `<Input type="file" accept="application/json,.json">`
   - a `<textarea>` for pasted JSON

   Exactly one must be provided; supplying both is a validation error. Both feed the identical validator, and the server resolves the file to text before parsing. The form posts to `previewLibraryImportAction` via `useActionState` and performs no writes.

3. **Preview and commit** — summary counts, a table of planned creates and skips, and a diagnostics list grouped by severity. Commit is disabled unless `canCommit`. The validated bundle is round-tripped to the commit action in a hidden field so the user does not re-upload or re-paste.

Notes:

- Success does **not** redirect; the report stays on screen and links to the created entities.
- Diagnostics render in a `role="alert"` region; the results region uses `aria-live="polite"`.
- Give the results region a stable `section[aria-label="Import results"]` selector for Playwright.
- Server Action body limit: confirm `serverActions.bodySizeLimit` in `next.config.ts` covers the 512 KB cap plus overhead.

## Security

- Treat file contents as fully untrusted input; validate every field with Zod at the server boundary.
- Enforce the byte cap before parsing, and entity/array caps during validation, to bound memory and CPU. Apply the same cap to pasted text as to uploaded files.
- Reject `videoUrl` values that are not `http:` or `https:`.
- Never log file contents, parsed payloads, or diagnostics containing athlete or programming data.
- Reject unknown object keys rather than ignoring them. `$schema` is the sole exception.
- Reject non-object JSON roots and guard against deeply nested payloads via the array caps.
- Cap total diagnostics returned (e.g. first 200) so a hostile file cannot produce an enormous response.

## Implementation Checklist

### 1. Format and validation

- [x] Add `format.ts` with `LIBRARY_IMPORT_FORMAT_VERSION` and limit constants.
- [x] Define strict Zod bundle schemas in `bundle-input.ts`, reusing `exerciseCategories`, `workoutBlockTypes`, `planScheduleTypes`, `planDaysOfWeek`, and `maxWeeklyFrequencyTarget` from the existing module schemas. Add `.meta({ title, description, examples })` to every field so the generated JSON Schema is self-documenting.
- [x] Allow and ignore a top-level `$schema` string key.
- [x] Map Zod issues to `ImportDiagnostic` with dotted JSON paths derived from `issue.path`.
- [x] Unit-test: syntax error, non-object root, unknown key, missing `formatVersion`, unsupported `formatVersion`, all arrays empty.

### 1b. Published JSON Schema

- [x] Add `json-schema.ts` with `buildLibraryImportJsonSchema` using `z.toJSONSchema(..., { target: "draft-2020-12", io: "input" })`.
- [x] Add the public route handler at `src/app/schemas/library-import/v1.json/route.ts`, generating at request time, with correct content type, caching, and CORS headers.
- [x] Unit-test the generated document: expected `$id`, `$schema`, top-level `exercises`/`workouts`/`plans` properties, and the plan-slot `oneOf` discriminated shape.
- [x] Document the two refinements that JSON Schema cannot express.

### 2. Planning

- [x] Implement `buildImportPlan` with in-file duplicate detection, case-insensitive existing-name matching, reference resolution, conflict strategy, and dependency ordering.
- [x] Emit `already_exists` warnings for skipped entities and confirm warnings alone leave `canCommit` true.
- [x] Unit-test: in-file duplicate, existing-name skip warning, existing-name fail, unknown exercise reference, unknown workout reference, forward reference within file, plan XOR violation, limit exceeded, empty file.

### 3. Persistence

- [x] Add `db/unit-of-work.ts` with the batch transaction interface and name lookups.
- [x] Implement `previewLibraryImport` and `commitLibraryImport` in `import-service.ts`: guard, re-read names, create in dependency order, return created counts.
- [x] Unit-test the service with `vi.fn()` fakes: org manager allowed, team manager allowed, viewer rejected, athlete rejected, non-member rejected, every read and write scoped to the caller's organization, rollback on mid-import failure.

### 4. Routes and actions

- [x] Add `src/app/(app)/app/library/import/page.tsx` and `actions.ts`.
- [x] Implement `previewLibraryImportAction` (read-only) and `commitLibraryImportAction`, mapping `DomainInvariantError` / `AuthorizationError` / `ResourceNotFoundError` to user-safe messages.
- [x] Resolve the file or pasted-text source to a single string, rejecting both-provided and neither-provided.
- [x] `revalidatePath` the exercises, workouts, and plans list routes after a successful commit.
- [x] Add the Import tab to `library-nav.tsx`, gated on `manage`.

### 5. UI

- [x] Build the input form with both file and paste sources, format reference with copyable prompt template, and results view. Built with semantic `table` and `section` markup plus existing primitives; no new shadcn components were needed.
- [x] Render warnings and errors distinctly; warnings must not disable commit.
- [x] Provide explicit loading, empty, error, and disabled states.
- [x] Verify keyboard access, visible focus, and accessible names on the file input, the textarea, and both submit buttons.
- [x] Component-test the results view with Testing Library: error diagnostics disable commit; warnings alone do not; clean preview enables it.

### 6. Documentation

- [ ] Add `docs/library-import-format.md` as the canonical spec, linked from the import page.
- [ ] Include a ready-to-paste example bundle plus the AI prompt template, with the schema URL embedded in the template.
- [ ] Document the schema versioning policy: additive changes stay on `v1`, breaking changes ship a new path.
- [ ] Note the feature and its permission requirements in `docs/app-functionality.md` and `docs/access-control.md`.

### 7. Verification

- [ ] Playwright spec `tests/library-import.spec.ts` following `tests/library-access.spec.ts` persona conventions:
  - manager uploads a valid bundle, previews, commits, and sees the entities in the library lists
  - manager pastes the same bundle as text and gets an equivalent preview
  - manager imports a bundle containing an already-existing exercise name and sees a warning while still being able to commit
  - manager uploads a bundle with an unknown exercise reference and cannot commit
  - manager uploads malformed JSON and sees a single syntax diagnostic
  - viewer cannot reach `/app/library/import`
  - a file naming another organization's exercise fails to resolve
  - `/schemas/library-import/v1.json` returns 200 and valid JSON while signed out
- [ ] `npm run validate`
- [ ] `npm run build`
