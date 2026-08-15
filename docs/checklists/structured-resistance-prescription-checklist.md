# Structured Resistance Prescription Checklist

## Objective

Replace the ambiguous free-text `load` concept with a structured **resistance** model that can accurately represent fixed weight, percentage of one-repetition maximum, bodyweight, bands, effort targets, and intentionally free-form prescriptions.

The implementation must preserve every historical workout, assignment snapshot, athlete override, effective session prescription, and result. It must never convert a relative or descriptive resistance into kilograms without the athlete-specific reference data required to reproduce that conversion.

This work must answer:

1. What resistance did the coach prescribe?
2. Is that prescription absolute, relative, descriptive, or effort-based?
3. What resistance did the athlete actually use?
4. Which values are eligible for fixed-weight volume calculations?
5. Can the displayed prescription and any derived metric be reproduced later?

Reference foundation:

- [assignment-prescription-workflow-checklist.md](assignment-prescription-workflow-checklist.md)
- [performance-kpi-phase-4-training-load-checklist.md](performance-kpi-phase-4-training-load-checklist.md)
- [library-import-implementation-checklist.md](library-import-implementation-checklist.md)
- [app-functionality.md](../app-functionality.md)
- [library-import-format.md](../library-import-format.md)
- [performance-kpi-recommendations.md](../performance-kpi-recommendations.md)

## Scope

### Included

- Rename staff and athlete prescription terminology from **Load** to **Resistance** where the value describes exercise resistance.
- A discriminated resistance model for workout items, assignment snapshots, athlete overrides, session-effective prescriptions, and athlete results.
- Structured fixed weight with `kg` or `lb` and canonical kilogram normalization.
- Structured percentage-of-1RM prescriptions without automatic kilogram resolution in this phase.
- Structured bodyweight, band, RPE-target, and RIR-target prescriptions.
- An explicit free-text escape hatch for resistance methods that the structured model does not yet represent.
- Backward-compatible display and editing of historical free-text `load` values.
- A versioned AI/library import contract that supports structured resistance while retaining import compatibility for version 1.
- Clear eligibility rules for strength volume and completed-versus-prescribed comparisons.
- Additive database migration, deterministic validation, authorization, tests, documentation, and rollout guidance.

### Deferred

- Athlete one-repetition-maximum profiles and automatic resolution of `%1RM` into an absolute weight.
- Automatic one-repetition-maximum estimation from completed sets.
- Plate math, implement weight, machine-stack configuration, or available-equipment rounding.
- Band color-to-force normalization.
- Bodyweight percentage or added/assisted bodyweight calculations.
- Velocity-based training prescriptions and bar-speed capture.
- Automatic progression, autoregulation, readiness, or fatigue recommendations.
- Converting RPE or RIR targets into a predicted fixed weight.
- Medical, injury-risk, or return-to-play interpretations.
- Rewriting legacy `load` strings by parsing values such as `75%`, `Heavy`, or `Bodyweight`.

## Product Decisions

### Terminology

- **Resistance**: the exercise-level prescription or completed method used to make a movement more or less difficult.
- **Fixed weight**: an absolute numeric resistance with `kg` or `lb`.
- **Relative resistance**: a prescription defined relative to an athlete-specific reference, initially `%1RM`.
- **Effort target**: a prescribed RPE or RIR value. It guides weight selection but is not itself a weight.
- **Result resistance**: the resistance method and value the athlete records for completed work.
- **Training load**: a derived session or aggregate performance concept. Do not use it as the label for an editable exercise resistance field.
- **Strength volume**: repetitions multiplied by normalized fixed weight. It is not calculated for relative, bodyweight, band, effort-target, or free-text resistance.
- Use **Resistance** in workout authoring, prepared assignment review, athlete prescription display, and result entry.
- Use **Weight** only inside the fixed-weight subtype, such as **Weight value** and **Weight unit**.

### Resistance Types

Use one discriminated type per prescribed or completed resistance:

| Type           | Required data              | Example              | Measurable weight |
| -------------- | -------------------------- | -------------------- | ----------------- |
| `fixed_weight` | positive value + `kg`/`lb` | `135 lb`             | Yes               |
| `percent_1rm`  | percentage                 | `80% 1RM`            | No                |
| `bodyweight`   | no numeric value           | `Bodyweight`         | No                |
| `band`         | band description           | `Heavy band`         | No                |
| `rpe`          | target from 1 through 10   | `RPE 8`              | No                |
| `rir`          | target from 0 through 10   | `2 RIR`              | No                |
| `free_text`    | non-empty description      | `Moderate sled load` | No                |

- Treat the discriminator and its payload as one value; invalid cross-type column combinations must be rejected.
- Percentage values must be greater than 0 and at most 200 to permit intentional overload methods while rejecting implausible input mistakes.
- RPE targets are numeric values from 1 through 10. Decide before implementation whether half steps are supported; do not silently round.
- RIR targets are nonnegative integers from 0 through 10.
- Band descriptions are short controlled text in the first version; do not infer force from color or brand.
- Free text is an explicit selected type, not the silent fallback for invalid structured input.
- A workout item may omit resistance entirely when resistance is not relevant.

### Prescription And Result Separation

- A prescribed resistance describes what the athlete should use.
- A result resistance describes what the athlete reports using.
- Never copy a prescribed resistance into a completed result as if the athlete confirmed it.
- Athlete result entry may default to an empty value even when a resistance was prescribed.
- Results support `fixed_weight`, `bodyweight`, `band`, and `free_text` initially.
- Defer `%1RM`, RPE, and RIR as result resistance types unless product review establishes what recording those values means after completion.
- Session RPE remains a session-level response and must not be confused with an exercise-level RPE resistance target.

### Percentage-Of-1RM Policy

- Store the prescribed percentage exactly as entered and snapshot it through assignment publication and session start.
- Do not store a resolved kilogram value until the product has versioned athlete 1RM records and an explicit resolution policy.
- Do not resolve against a current mutable personal best at display or reporting time.
- A future resolver must snapshot the reference value, reference unit, reference record identifier, resolution timestamp, and rounding policy with the effective session prescription.
- Until that resolver exists, `%1RM` is displayable and comparable as a prescription type but unavailable for prescribed strength-volume calculations.

### Bodyweight, Band, And Effort Targets

- `bodyweight` means no external fixed weight is asserted. Do not substitute athlete body mass in strength-volume calculations.
- `band` retains its entered description and remains unmeasurable unless a future force-profile model is introduced.
- Exercise-level RPE or RIR is a target for selecting resistance, not the session RPE response used for internal load.
- UI copy must keep **Target RPE/RIR** distinct from **Session RPE**.

### Free Text And Legacy Values

- Preserve historical `load` strings exactly for display and reproducibility.
- Treat an existing row with `load` text and no structured resistance as legacy free text.
- Do not classify or parse historical strings automatically.
- When a coach explicitly edits a legacy value, require selection of a structured resistance type or explicit `free_text`.
- Keep legacy rows readable through all assignment, athlete, result, and performance routes.

### Metric Eligibility

- Only `fixed_weight` values with a valid normalized kilogram value are measurable weight.
- Strength volume remains:

```text
strengthVolumeKg = sum(reps * normalizedWeightKg)
```

- A completed-versus-prescribed strength-volume ratio requires measurable fixed weight and repetitions on both sides.
- Do not compare a fixed-weight result with an unresolved `%1RM`, bodyweight, band, RPE, RIR, or free-text prescription as a volume-completion ratio.
- Continue returning explicit unavailable reasons instead of zero. Add structured reasons such as `relative_resistance`, `non_weight_resistance`, and `legacy_resistance` where useful.
- Team and organization summaries must aggregate raw eligible facts and preserve existing tenant and prepared-delivery scope.

## Proposed Domain Contract

Use a shared application-layer discriminated union rather than passing parallel nullable fields through business logic:

```ts
type Resistance =
  | { type: "fixed_weight"; value: number; unit: "kg" | "lb" }
  | { type: "percent_1rm"; percentage: number }
  | { type: "bodyweight" }
  | { type: "band"; description: string }
  | { type: "rpe"; target: number }
  | { type: "rir"; target: number }
  | { type: "free_text"; description: string };
```

- Keep normalization output server-owned and outside untrusted input types.
- Use one parser and validator at each server boundary.
- Use exhaustive switches so a new resistance type cannot silently inherit incorrect display or metric behavior.
- Keep database mapping inside module-owned repositories rather than exposing column combinations throughout UI code.

## Proposed Persistence Strategy

### Additive Columns

Add an enum discriminator and type-specific nullable fields to each resistance-owning table:

- `workout_items`
- `assignment_workout_item_snapshots`
- `assignment_athlete_item_overrides`
- `assignment_session_effective_item_prescriptions`
- `assignment_session_item_results`

Candidate columns:

- `resistance_type`
- `resistance_value`
- `resistance_unit`
- `resistance_percentage`
- `resistance_target`
- `resistance_description`
- `normalized_resistance_kg`

Final names should follow existing Drizzle conventions and avoid retaining `load` in newly introduced public types.

### Compatibility Columns

- Retain existing `load`, `load_value`, `load_unit`, and `normalized_load_kg` columns during rollout.
- Do not rename or drop compatibility columns in the same release.
- New structured writes populate resistance columns as the source of truth.
- During a bounded compatibility window, fixed-weight writes may also populate existing numeric load columns if old application instances must read them. Document and test any dual-write rule.
- Reads prefer structured resistance when `resistance_type` is present, otherwise adapt existing numeric load columns to `fixed_weight`, otherwise expose legacy `load` as legacy free text.
- A later cleanup phase may remove dual writes only after every consumer and deployed instance reads structured resistance.

### Database Constraints

- Require the payload appropriate to the selected discriminator and reject unrelated payload columns.
- Require fixed-weight value, unit, and normalized kilograms together and ensure all are positive.
- Require `%1RM` percentage within the approved bounds and prohibit normalized kilograms.
- Require band/free-text descriptions and prohibit numeric weight fields.
- Require RPE/RIR targets within approved bounds and prohibit weight fields.
- Require all structured resistance fields to be null when `resistance_type` is null.
- Preserve organization-aware foreign keys and indexes across snapshots, recipients, sessions, and overrides.

## Target Workflows

### Workout Authoring

1. Coach adds an exercise to a workout.
2. Coach optionally enables **Resistance**.
3. Coach selects a resistance type.
4. The editor displays only fields relevant to that type.
5. The server validates and stores the discriminated value.
6. The workout summary renders a canonical label such as `135 lb`, `80% 1RM`, `Bodyweight`, `Heavy band`, `RPE 8`, or `2 RIR`.

### Prepared Assignment Review

1. Staff review the shared base resistance for each exercise.
2. To individualize it, staff check **Resistance** and select an override type.
3. The override may differ in both type and payload from the base prescription.
4. Clearing the override returns the athlete to the complete base resistance value.
5. Effective prescription resolution replaces the whole resistance union atomically; it never merges fields from different resistance types.

### Athlete Result Entry

1. Athlete sees the effective resistance prescription as guidance.
2. Athlete records the resistance actually used through a separate result control.
3. Fixed weight requires value and unit; descriptive methods retain their selected type and description.
4. Saving, autosaving, submitting, resetting, and completed-result editing preserve the result resistance independently of the prescription.

## Milestone 1: Product Contract And Shared Types

### Implementation Checklist

- [x] Confirm the initial resistance type set and approved labels with representative coaching workflows.
- [x] Support half-step exercise-level RPE targets from 1 through 10.
- [x] Confirm that result resistance initially excludes `%1RM`, RPE, and RIR.
- [x] Add the shared discriminated `Resistance` type and narrower prescription/result variants.
- [x] Add strict Zod discriminated unions for application and untrusted boundary input.
- [x] Add exhaustive canonical display formatting for every type.
- [x] Add fixed-weight normalization using the existing exact pounds-to-kilograms conversion.
- [x] Add metric-eligibility helpers that return structured unavailable reasons.
- [x] Add adapters for existing numeric load rows and legacy free-text rows.
- [x] Keep session RPE types and exercise resistance-target types explicitly separate.

### Tests

- [x] Accept every valid resistance type and reject every invalid payload combination.
- [x] Reject non-finite, zero, negative, out-of-range, and unsupported-unit values.
- [x] Verify canonical labels for every resistance type.
- [x] Verify exact `lb` to `kg` normalization for fixed weight.
- [x] Verify only fixed weight is measurable for strength volume.
- [x] Verify legacy numeric and free-text adapters do not fabricate structured values.

### Acceptance Criteria

- [x] One shared domain contract represents resistance across modules.
- [x] Relative and descriptive resistance cannot be mistaken for normalized weight.
- [x] Adding a resistance type requires explicit handling in validation, display, persistence mapping, and metric eligibility.

## Milestone 2: Schema And Migration

### Implementation Checklist

- [x] Add the resistance discriminator enum and type-specific columns to every owning table.
- [x] Add database checks for each valid discriminator/payload combination.
- [x] Preserve existing `load` columns and historical rows unchanged.
- [x] Add repository mappers between database columns and the shared resistance union.
- [x] Update Drizzle inferred types while using domain mappers at service boundaries.
- [x] Update workout snapshot creation to copy structured resistance exactly.
- [x] Update athlete override persistence to replace the whole resistance value atomically.
- [x] Update session-start snapshotting to preserve the resolved effective resistance.
- [x] Update result persistence for the approved result resistance types.
- [x] Generate a forward-only Drizzle migration without modifying applied migrations.

### Migration And Compatibility Tests

- [x] Apply all migrations from an empty database.
- [x] Read historical text-only, numeric-load, and null-load rows through compatibility adapters.
- [x] Write and read every structured resistance type through shared persistence mappers; verify workout and assignment snapshot persistence in database integration.
- [x] Verify structured assignment overrides survive publication and session start.
- [x] Verify structured results survive autosave, submit, reload, and completed-result editing; existing reset coverage preserves deletion for unsubmitted sessions.
- [x] Verify invalid cross-type column combinations fail database constraints.
- [x] Verify old published assignments and sessions remain readable without backfill.
- [x] Verify organization, assignment, recipient, athlete, item, and session ownership checks remain on all structured write paths.

### Acceptance Criteria

- [x] Historical records remain byte-for-byte intact in compatibility columns.
- [x] New structured values remain reproducible through source edits, assignment publication, override changes, and session history.
- [x] A failed multi-table operation leaves no partially persisted prescription or result state.

## Milestone 3: Workout Authoring And Library Import

### Workout Editor

- [x] Rename exercise prescription **Load** controls to **Resistance**.
- [x] Add a type selector with fixed weight, `%1RM`, bodyweight, band, RPE, RIR, and free text.
- [x] Render only type-relevant controls with visible labels and units.
- [x] Preserve an explicit **No resistance** state through the field toggle.
- [x] Show canonical resistance summaries in workout detail.
- [x] Adapt legacy free-text values into an explicit `free_text` editor state without parsing them.
- [x] Preserve optimistic concurrency and draft/activation validation.
- [x] Preserve keyboard access, visible focus, screen-reader names, and responsive layouts through shared controls.

### AI And Library Import

- [x] Keep `formatVersion: 1` imports supported with the existing optional `load` string.
- [x] Define `formatVersion: 2` with a discriminated `resistance` object and no ambiguous top-level item `load` field.
- [x] Reject documents that mix v1 `load` and v2 `resistance` semantics.
- [x] Update Zod validators and generate versioned JSON Schemas from the same structured contract.
- [x] Add a v2 `%1RM` example; all resistance branches are documented by the generated schema.
- [x] Update AI prompt guidance to choose a structured type and avoid inventing fixed weight when athlete context is unavailable.
- [x] Preview structured resistance validation diagnostics before commit.
- [x] Preserve all-or-nothing import behavior and existing name-reference resolution.
- [x] Keep imported workouts and plans in draft status for human review.

### Tests

- [x] Validate every resistance type through the shared schema and exercise `%1RM` in the workout editor component.
- [x] Preserve structured resistance through workout duplication and existing archive/restore workflows.
- [x] Reject stale edits and invalid type transitions through existing concurrency and strict union validation.
- [x] Continue importing valid v1 free-text load bundles.
- [x] Import and preview valid v2 structured resistance bundles.
- [x] Reject malformed or cross-version v2 resistance fields with path-specific diagnostics.
- [x] Verify both public JSON Schemas match runtime validation.

### Acceptance Criteria

- [x] AI-generated `80% 1RM` is stored as structured relative resistance rather than ambiguous text or kilograms.
- [x] Coaches can intentionally use descriptive resistance without weakening validation of fixed weight.
- [x] Existing v1 import clients continue to work during the documented compatibility window.

## Milestone 4: Assignment Preparation And Individual Overrides

### Implementation Checklist

- [x] Rename prepared and post-publication prescription labels from **Load** to **Resistance**.
- [x] Replace the fixed-weight-only override control with a resistance type selector and type-relevant fields.
- [x] Show the complete canonical base resistance and existing override to authorized staff.
- [x] Make the override checkbox replace the whole resistance union rather than individual storage columns.
- [x] Support changing resistance type for one athlete without changing the shared snapshot or another recipient.
- [x] Clear the complete resistance override atomically so the base value is inherited again.
- [x] Reuse shared validation, canonical formatting, normalization, authorization, and optimistic concurrency.
- [x] Keep post-publication changes limited to future unstarted sessions.
- [x] Keep prepared assignments hidden from athletes until publication.
- [x] Snapshot effective resistance at session start before results can be saved.

### Tests

- [x] Override a shared `80% 1RM` prescription with `135 lb` for one athlete.
- [x] Validate every override resistance branch through the shared strict union and render type-relevant fields.
- [x] Verify recipient-scoped overrides do not mutate the shared snapshot or another recipient.
- [x] Clear an override through the existing complete-override deletion path and restore base inheritance.
- [x] Verify concurrent edits return an actionable conflict.
- [x] Verify athlete, Viewer, unmanaged Team Manager, foreign organization, and foreign team writes fail safely through existing authorization coverage.
- [x] Verify started and submitted sessions retain their session-start resistance snapshot after later changes.

### Acceptance Criteria

- [x] Staff can determine the exact effective resistance each athlete will see before publication.
- [x] No override can combine a discriminator from one resistance type with payload from another.
- [x] Historical effective prescriptions remain immutable once a session starts.

## Milestone 5: Athlete Results And Offline-Safe Capture

### Implementation Checklist

- [x] Rename athlete result **Load** controls and summaries to **Resistance used**.
- [x] Keep prescribed resistance visually distinct from athlete-entered result resistance.
- [x] Add result resistance type controls for fixed weight, bodyweight, band, and free text.
- [x] Require value and unit together for fixed-weight results.
- [x] Keep descriptive result methods unmeasurable without substituting zero.
- [x] Extend FormData parsing, autosave payloads, idempotency handling, and server-side Zod validation.
- [x] Preserve offline-safe drafts and mutation identifiers.
- [x] Preserve first submission time and timeliness classification during completed-result edits.
- [x] Keep athletes scoped to their own assignment sessions and results.
- [x] Never accept normalized kilograms from the client.

### Tests

- [x] Fixed-weight results persist and normalize through save, submit, reload, and edit.
- [x] Bodyweight, band, and free-text results persist without fabricated kilograms.
- [x] Empty resistance remains valid when the athlete completes a session.
- [x] Invalid type/payload combinations return actionable errors without losing persisted result data.
- [x] Retried autosaves remain idempotent.
- [x] Athlete ownership, tenant isolation, and session-state locks remain enforced.

### Acceptance Criteria

- [x] Athletes can accurately record what they used without confirming the prescription by default.
- [x] Offline and retry behavior remains equivalent to current result capture.
- [x] Result resistance never mutates the effective prescription snapshot.

## Milestone 6: Performance Metrics And Reporting

### Implementation Checklist

- [x] Update strength-volume fact queries to consume structured fixed-weight values.
- [x] Preserve compatibility reads for historical normalized numeric loads.
- [x] Exclude relative, bodyweight, band, effort-target, free-text, and unresolved legacy values from fixed-weight volume.
- [x] Add structured unavailable reasons to assignment, team, organization, and athlete training-load read models.
- [x] Update completed-versus-prescribed comparisons to require measurable fixed weight on both sides.
- [x] Display resistance type and canonical values in authorized session review.
- [x] Keep session RPE internal load separate from exercise-level RPE resistance targets.
- [x] Aggregate from raw eligible facts rather than averaging athlete percentages.
- [x] Preserve prepared-delivery team scope, direct-recipient rules, and organization isolation.
- [x] Avoid ranking athletes or labeling relative resistance as safe, unsafe, strong, or weak.

### Tests

- [x] Fixed-weight prescribed and completed values produce reproducible strength volume.
- [x] `%1RM` prescription plus fixed-weight result reports prescribed volume unavailable with `relative_resistance`.
- [x] Bodyweight, band, RPE, RIR, free-text, and legacy values never contribute fabricated volume.
- [x] Mixed sessions aggregate only eligible fixed-weight rows and report partial coverage.
- [x] Team and organization totals continue to reconcile from authorized raw facts.
- [x] Historical numeric-load metrics remain unchanged after compatibility mapping.

### Acceptance Criteria

- [x] Every displayed volume can be traced to repetitions and normalized fixed weight.
- [x] Relative and descriptive resistance remains useful prescription context without becoming false quantitative data.
- [x] Existing compliance and timeliness metrics remain unchanged.

## Milestone 7: Documentation, Rollout, And Cleanup

### Documentation

- [x] Update [app-functionality.md](../app-functionality.md) with resistance terminology and supported types.
- [x] Update [library-import-format.md](../library-import-format.md) with v1 compatibility and the v2 structured contract.
- [x] Update [performance-kpi-recommendations.md](../performance-kpi-recommendations.md) with metric eligibility and unavailable reasons.
- [x] Add a cross-reference to the completed assignment prescription workflow checklist without rewriting its historical record.
- [x] Update coach-facing and athlete-facing copy to distinguish resistance, weight, result, and training load.
- [x] Document why `%1RM`, bodyweight, bands, RPE, and RIR do not produce fixed-weight volume in this phase.
- [x] Document migration order, compatibility reads, monitoring, and forward-fix recovery.

### Rollout Safety

- [x] Document deployment of additive enums and nullable columns before code writes structured resistance.
- [x] Keep structured reads backward-compatible with old rows through compatibility adapters.
- [x] Use coordinated migration-first deployment; no dual writes are required for structured resistance.
- [x] Document monitoring of structured type adoption, legacy fallback use, invalid input rates, and metric coverage separately.
- [x] Preserve existing sanitized logging rules without adding raw athlete result payloads.
- [x] Keep compatibility columns until all production consumers use structured resistance.
- [x] Defer compatibility-column removal to a separately reviewed cleanup migration.

### Required Verification

- [x] Run focused domain, validation, repository, snapshot, override, session, import, and metric tests during implementation.
- [x] Run all 52 library, assignment, tenant-isolation, role-access, and athlete-result Playwright workflows.
- [x] Run repository lint, type-check, 488 Vitest tests, and all Playwright tests. Full `npm run validate` remains blocked only by pre-existing formatting in `assignment-target-options.ts`.
- [x] Run `npm run build`.
- [x] Smoke test v1/v2 schemas, `%1RM` workout authoring, prepared `80% 1RM → 135 lb` individualization, athlete result capture, and staff reporting in a migrated environment.

### Final Acceptance Criteria

- [x] `80% 1RM` is structured, reproducible prescription data and is never silently interpreted as kilograms.
- [x] Fixed weight is the only resistance type eligible for kilogram-based strength volume.
- [x] Coaches and athletes use **Resistance** consistently while **Weight** appears only for fixed-weight values.
- [x] Historical free-text and numeric load records remain readable and metrically consistent.
- [x] Workout templates, assignment snapshots, athlete overrides, session-effective prescriptions, and results preserve resistance type and payload end to end.
- [x] Tenant isolation, authorization, immutable session history, and offline-safe result capture remain intact.

## Open Product Decisions To Resolve Before Implementation

- [x] Exercise-level RPE targets support half steps such as `7.5`.
- [x] Result resistance excludes `%1RM`, RPE, and RIR in the first release.
- [x] Unmodified `bodyweight` is sufficient initially; added and assisted weight are deferred.
- [x] Band resistance uses bounded free text in the first release.
- [x] The initial `%1RM` upper bound is 200.
- [x] Use migration-first coordinated deployment; fixed-weight dual writes remain a compatibility safeguard until cleanup.
- [ ] When athlete max records are introduced, which record and rounding policy should resolve `%1RM` for a scheduled session?
