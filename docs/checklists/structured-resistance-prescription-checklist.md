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

- [ ] Add the resistance discriminator enum and type-specific columns to every owning table.
- [ ] Add database checks for each valid discriminator/payload combination.
- [ ] Preserve existing `load` columns and historical rows unchanged.
- [ ] Add repository mappers between database columns and the shared resistance union.
- [ ] Update Drizzle inferred types without exposing parallel nullable fields to application services.
- [ ] Update workout snapshot creation to copy structured resistance exactly.
- [ ] Update athlete override persistence to replace the whole resistance value atomically.
- [ ] Update session-start snapshotting to preserve the resolved effective resistance.
- [ ] Update result persistence for the approved result resistance types.
- [ ] Generate a forward-only Drizzle migration without modifying applied migrations.

### Migration And Compatibility Tests

- [ ] Apply all migrations from an empty database.
- [ ] Read historical text-only, numeric-load, and null-load rows through compatibility adapters.
- [ ] Write and read every structured resistance type on workout items and snapshots.
- [ ] Verify structured assignment overrides survive publication and session start.
- [ ] Verify structured results survive autosave, submit, reload, reset, and completed-result editing.
- [ ] Verify invalid cross-type column combinations fail database constraints.
- [ ] Verify old published assignments and sessions remain readable without backfill.
- [ ] Verify no tenant-owned resistance value crosses organization, assignment, recipient, or session boundaries.

### Acceptance Criteria

- [ ] Historical records remain byte-for-byte intact in compatibility columns.
- [ ] New structured values remain reproducible through source edits, assignment publication, override changes, and session history.
- [ ] A failed multi-table operation leaves no partially migrated prescription or result state.

## Milestone 3: Workout Authoring And Library Import

### Workout Editor

- [ ] Rename exercise prescription **Load** controls to **Resistance**.
- [ ] Add a type selector with fixed weight, `%1RM`, bodyweight, band, RPE, RIR, and free text.
- [ ] Render only type-relevant controls with visible labels and units.
- [ ] Preserve an explicit **No resistance** state.
- [ ] Show canonical resistance summaries in workout detail and library lists.
- [ ] Require an explicit type when a coach edits a legacy free-text value.
- [ ] Preserve optimistic concurrency and draft/activation validation.
- [ ] Preserve keyboard access, visible focus, screen-reader names, and mobile layouts.

### AI And Library Import

- [ ] Keep `formatVersion: 1` imports supported with the existing optional `load` string.
- [ ] Define `formatVersion: 2` with a discriminated `resistance` object and no ambiguous top-level item `load` field.
- [ ] Reject documents that mix v1 `load` and v2 `resistance` semantics.
- [ ] Update Zod validators and generate JSON Schema from the same structured contract.
- [ ] Add examples for every resistance type, including `80% 1RM`.
- [ ] Update AI prompt guidance to choose a structured type and avoid inventing fixed weight when athlete context is unavailable.
- [ ] Preview canonical resistance labels and validation diagnostics before commit.
- [ ] Preserve all-or-nothing import behavior and existing name-reference resolution.
- [ ] Keep imported workouts and plans in draft status for human review.

### Tests

- [ ] Create and edit a workout using every resistance type.
- [ ] Duplicate and archive/restore workouts without losing structured resistance.
- [ ] Reject stale edits and invalid type transitions.
- [ ] Continue importing valid v1 free-text load bundles.
- [ ] Import and preview valid v2 bundles for every resistance type.
- [ ] Reject malformed v2 resistance objects with path-specific diagnostics.
- [ ] Verify the public JSON Schema and examples match runtime validation.

### Acceptance Criteria

- [ ] AI-generated `80% 1RM` is stored as structured relative resistance rather than ambiguous text or kilograms.
- [ ] Coaches can intentionally use descriptive resistance without weakening validation of fixed weight.
- [ ] Existing v1 import clients continue to work during the documented compatibility window.

## Milestone 4: Assignment Preparation And Individual Overrides

### Implementation Checklist

- [ ] Rename prepared and post-publication prescription labels from **Load** to **Resistance**.
- [ ] Replace the fixed-weight-only override control with a resistance type selector and type-relevant fields.
- [ ] Show the complete base resistance and effective resistance to authorized staff.
- [ ] Make the override checkbox replace the whole resistance union rather than individual storage columns.
- [ ] Support changing resistance type for one athlete without changing the shared snapshot or another recipient.
- [ ] Clear the complete resistance override atomically so the base value is inherited again.
- [ ] Reuse shared validation, canonical formatting, normalization, authorization, and optimistic concurrency.
- [ ] Keep post-publication changes limited to future unstarted sessions.
- [ ] Keep prepared assignments hidden from athletes until publication.
- [ ] Snapshot effective resistance at session start before results can be saved.

### Tests

- [ ] Override a shared `80% 1RM` prescription with `135 lb` for one athlete.
- [ ] Override a shared fixed weight with bodyweight, band, RPE, RIR, and free text.
- [ ] Verify a second athlete continues to inherit the shared resistance.
- [ ] Clear an override and verify complete base resistance inheritance.
- [ ] Verify concurrent edits return an actionable conflict.
- [ ] Verify athlete, Viewer, unmanaged Team Manager, foreign organization, and foreign team writes fail safely.
- [ ] Verify started and submitted sessions retain their session-start resistance snapshot after later changes.

### Acceptance Criteria

- [ ] Staff can determine the exact effective resistance each athlete will see before publication.
- [ ] No override can combine a discriminator from one resistance type with payload from another.
- [ ] Historical effective prescriptions remain immutable once a session starts.

## Milestone 5: Athlete Results And Offline-Safe Capture

### Implementation Checklist

- [ ] Rename athlete result **Load** controls and summaries to **Resistance used**.
- [ ] Keep prescribed resistance visually distinct from athlete-entered result resistance.
- [ ] Add result resistance type controls for the approved initial result types.
- [ ] Require value and unit together for fixed-weight results.
- [ ] Keep descriptive result methods unmeasurable without substituting zero.
- [ ] Extend FormData parsing, autosave payloads, idempotency handling, and server-side Zod validation.
- [ ] Preserve offline-safe drafts and mutation identifiers.
- [ ] Preserve first submission time and timeliness classification during completed-result edits.
- [ ] Keep athletes scoped to their own assignment sessions and results.
- [ ] Never accept normalized kilograms from the client.

### Tests

- [ ] Fixed-weight results persist and normalize through save, submit, reload, and edit.
- [ ] Bodyweight, band, and free-text results persist without fabricated kilograms.
- [ ] Empty resistance remains valid when the athlete completes a session.
- [ ] Invalid type/payload combinations return actionable errors without losing other result data.
- [ ] Retried autosaves remain idempotent.
- [ ] Athlete ownership, tenant isolation, and session-state locks remain enforced.

### Acceptance Criteria

- [ ] Athletes can accurately record what they used without confirming the prescription by default.
- [ ] Offline and retry behavior remains equivalent to current result capture.
- [ ] Result resistance never mutates the effective prescription snapshot.

## Milestone 6: Performance Metrics And Reporting

### Implementation Checklist

- [ ] Update strength-volume calculators to consume structured fixed-weight facts.
- [ ] Preserve compatibility reads for historical normalized numeric loads.
- [ ] Exclude relative, bodyweight, band, effort-target, free-text, and unresolved legacy values from fixed-weight volume.
- [ ] Add structured unavailable reasons to assignment, team, organization, and athlete read models.
- [ ] Update completed-versus-prescribed comparisons to require measurable fixed weight on both sides.
- [ ] Display resistance type and canonical values in authorized session review.
- [ ] Keep session RPE internal load separate from exercise-level RPE resistance targets.
- [ ] Aggregate from raw eligible facts rather than averaging athlete percentages.
- [ ] Preserve prepared-delivery team scope, direct-recipient rules, and organization isolation.
- [ ] Avoid ranking athletes or labeling relative resistance as safe, unsafe, strong, or weak.

### Tests

- [ ] Fixed-weight prescribed and completed values produce reproducible strength volume.
- [ ] `%1RM` prescription plus fixed-weight result reports prescribed volume unavailable.
- [ ] Bodyweight, band, RPE, RIR, free-text, and legacy values never contribute fabricated volume.
- [ ] Mixed sessions aggregate only eligible fixed-weight rows and report partial coverage.
- [ ] Team and organization totals reconcile with authorized raw facts.
- [ ] Historical numeric-load metrics remain unchanged after compatibility mapping.

### Acceptance Criteria

- [ ] Every displayed volume can be traced to repetitions and normalized fixed weight.
- [ ] Relative and descriptive resistance remains useful prescription context without becoming false quantitative data.
- [ ] Existing compliance and timeliness metrics remain unchanged.

## Milestone 7: Documentation, Rollout, And Cleanup

### Documentation

- [ ] Update [app-functionality.md](../app-functionality.md) with resistance terminology and supported types.
- [ ] Update [library-import-format.md](../library-import-format.md) with v1 compatibility and the v2 structured contract.
- [ ] Update [performance-kpi-recommendations.md](../performance-kpi-recommendations.md) with metric eligibility and unavailable reasons.
- [ ] Add a cross-reference to the completed assignment prescription workflow checklist without rewriting its historical record.
- [ ] Update coach-facing and athlete-facing copy to distinguish resistance, weight, result, and training load.
- [ ] Document why `%1RM`, bodyweight, bands, RPE, and RIR do not produce fixed-weight volume in this phase.
- [ ] Document migration order, dual-write behavior if used, monitoring, and forward-fix recovery.

### Rollout Safety

- [ ] Deploy additive enums and nullable columns before code writes structured resistance.
- [ ] Keep structured reads backward-compatible with old rows throughout rolling deployment.
- [ ] If dual writes are required, verify old and new application versions display fixed weight consistently.
- [ ] Monitor structured type adoption, legacy fallback use, invalid input rates, and metric coverage separately.
- [ ] Verify logs and errors do not contain raw athlete result payloads or sensitive performance data.
- [ ] Keep compatibility columns until production reads, exports if later introduced, analytics, and support tooling use structured resistance.
- [ ] Remove compatibility columns only through a separately reviewed cleanup migration.

### Required Verification

- [ ] Run focused domain, validation, repository, snapshot, override, session, import, and metric tests during implementation.
- [ ] Run relevant library, assignment, tenant-isolation, role-access, and athlete-result Playwright workflows.
- [ ] Run `npm run validate`.
- [ ] Run `npm run build`.
- [ ] Smoke test v1 import, v2 import, workout authoring, prepared individualization, athlete result entry, and staff reporting in a migrated environment.

### Final Acceptance Criteria

- [ ] `80% 1RM` is structured, reproducible prescription data and is never silently interpreted as kilograms.
- [ ] Fixed weight is the only resistance type eligible for kilogram-based strength volume.
- [ ] Coaches and athletes use **Resistance** consistently while **Weight** appears only for fixed-weight values.
- [ ] Historical free-text and numeric load records remain readable and metrically consistent.
- [ ] Workout templates, assignment snapshots, athlete overrides, session-effective prescriptions, and results preserve resistance type and payload end to end.
- [ ] Tenant isolation, authorization, immutable session history, and offline-safe result capture remain intact.

## Open Product Decisions To Resolve Before Implementation

- [x] Exercise-level RPE targets support half steps such as `7.5`.
- [x] Result resistance excludes `%1RM`, RPE, and RIR in the first release.
- [x] Unmodified `bodyweight` is sufficient initially; added and assisted weight are deferred.
- [x] Band resistance uses bounded free text in the first release.
- [x] The initial `%1RM` upper bound is 200.
- [x] Use migration-first coordinated deployment; fixed-weight dual writes remain a compatibility safeguard until cleanup.
- [ ] When athlete max records are introduced, which record and rounding policy should resolve `%1RM` for a scheduled session?
