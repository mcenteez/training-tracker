# Assignment Prescription Workflow Checklist

## Objective

Make individual prescription planning a normal part of assignment creation instead of a correction performed after publication. Coaches should be able to reuse one plan or workout as a shared training structure, review the resolved recipient list, individualize prescribed work for specific athletes, and verify the effective prescriptions before any athlete can see the assignment.

This workflow must preserve immutable assignment history, tenant isolation, team-scoped authorization, and the existing separation between prescribed work and athlete-recorded results.

The workflow must answer:

1. What shared training structure and base prescription will be delivered?
2. Which athletes will receive it?
3. Which prescribed fields differ for each athlete?
4. What effective prescription will each athlete see when the assignment is released?

Reference foundation:

- [app-functionality.md](../app-functionality.md)
- [access-control.md](../access-control.md)
- [performance-kpi-phase-4-training-load-checklist.md](performance-kpi-phase-4-training-load-checklist.md)

## Scope

### Included

- A pre-publication preparation stage that materializes assignment recipients and source snapshots without making the assignment athlete-visible.
- Athlete-specific prescription overrides during preparation using the existing shared-base-plus-override model.
- A staff review surface for recipient coverage, individualized fields, and each athlete's effective prescription.
- Explicit lifecycle rules for preparing, returning to draft, publishing, and canceling assignments.
- Efficient individualization for assignments with multiple recipients.
- Server-side authorization, validation, optimistic concurrency, and audit metadata for preparation and prescription changes.
- Forward-safe migration and compatibility for existing draft, published, and canceled assignments.
- Updated product, terminology, access-control, and workflow documentation.
- Unit, integration, component, and Playwright coverage.

### Deferred

- Editing the organization workout or plan library from the assignment preparation surface.
- Automatically deriving prescriptions from one-repetition max, body weight, velocity, readiness, injury status, or wearable data.
- Percentage-of-1RM, RPE, and RIR prescription types not already represented by the workout model.
- Rules engines that automatically individualize every athlete.
- Athlete-authored prescription changes.
- Per-occurrence overrides that differ by date within the same plan slot.
- Cohort or subgroup override entities that persist independently of assignment recipients.
- Retroactively changing prescriptions for sessions that have started or been submitted.
- Rewriting existing published assignments into the new preparation lifecycle.

## Product Decisions

### Terminology

- **Workout template**: reusable session structure stored in the organization library.
- **Base prescription**: reps, load, duration, distance, rest, tempo, and notes copied from the selected workout into an assignment snapshot.
- **Individual prescription**: athlete-specific fields layered over the shared base prescription for one assignment item and optional plan slot.
- **Effective prescription**: the resolved values an athlete will see after applying an individual prescription to the base prescription.
- **Result**: values the athlete records for completed work.
- **Metric or KPI**: a value derived from prescriptions, results, session facts, or history for analysis.
- Do not use `metric` as a generic label for editable prescribed fields in staff or athlete interfaces.

### Template Reuse

- Use one workout or plan when recipients share the same session purpose, exercise structure, and schedule.
- Keep athlete-specific prescribed values on the assignment recipient, not in athlete-named library copies.
- Fork a library workout only when the resulting variation is intended to be reusable as a distinct template for future assignments or cohorts.
- Never mutate a source workout, source plan, or shared assignment snapshot to individualize one athlete.

### Assignment Lifecycle

- Add `prepared` between `draft` and `published`.
- `draft`: source, schedule, and targets are editable; recipients and source snapshots are not authoritative; athletes cannot see the assignment.
- `prepared`: source, schedule, targets, resolved recipients, and source snapshots are frozen; authorized staff can manage individual prescriptions; athletes cannot see the assignment.
- `published`: delivery details and prepared prescriptions are released; athletes see only their effective prescriptions according to existing availability rules.
- `canceled`: no further delivery or prescription changes are allowed.
- Allow only `draft → prepared → published` for new releases.
- Allow `draft → canceled`, `prepared → draft`, and `prepared → canceled`.
- Do not allow a published assignment to return to prepared or draft.
- Keep current published assignments valid without requiring a backfill to `prepared`.

### Preparation

- Resolve targets into a deduplicated recipient list when staff prepare the assignment.
- Snapshot the selected workout or plan in the same transaction that marks the assignment prepared.
- Capture team scope for each prepared recipient so authorization and the intended audience are reviewable before publication.
- Treat the prepared recipient list as the explicit delivery audience; later team roster additions must not silently broaden it.
- Revalidate organization membership, athlete eligibility, actor authorization, and managed-team scope when publishing.
- If a prepared recipient is no longer eligible or authorized, block publication with an actionable recipient-level error.
- If a team roster changed after preparation, show that the prepared audience is stale and require staff to either keep the reviewed eligible audience or return to draft and prepare again according to the approved product policy.
- Do not expose prepared assignments through athlete assignment queries, counts, notifications, or dashboards.

### Returning To Draft

- Returning to draft is an explicit destructive preparation reset, not an ordinary field edit.
- Explain that changing source, schedule, or targets requires discarding prepared snapshots and individual prescriptions.
- Require confirmation when any individual prescription exists.
- Delete prepared recipients, team scopes, source snapshots, and individual prescription overrides atomically when returning to draft.
- Preserve the draft assignment record and its editable target selections.
- Record the actor and timestamp of the reset without logging prescription values.

### Individual Prescriptions

- Reuse the existing field-level override precedence: individual value, then shared base value.
- Continue to support reps, measurable or free-text load, exercise duration, distance, rest, tempo, and notes.
- Scope each individual prescription by organization, assignment, recipient, athlete, item snapshot, and optional plan-slot snapshot.
- In prepared assignments, permit create, replace, clear-field, and clear-all operations.
- In published assignments, preserve the existing rule that changes affect only future unstarted sessions.
- Snapshot the effective prescription when a session starts; later staff changes must not rewrite it.
- Do not require every athlete to have an override. Inheriting the complete base prescription is valid.
- Do not create empty override rows when every field inherits the base.

### Publication

- Publish only a prepared assignment with at least one eligible recipient and at least one workout snapshot.
- Revalidate optimistic version, source ownership, recipient eligibility, actor scope, and schedule validity in the publication transaction.
- Do not recreate source snapshots or silently refresh recipients during publication.
- Mark the assignment published only after every validation succeeds.
- Preserve all-or-nothing behavior: no athlete may see a partially published assignment.
- Keep prepared overrides as the authoritative individual prescriptions for future unstarted sessions after publication.
- Continue to snapshot effective prescriptions atomically at session start.

### Existing Assignment Compatibility

- Existing `draft` assignments continue through the new prepare step.
- Existing `published` assignments retain their current snapshots, recipients, overrides, and athlete visibility.
- Existing `canceled` assignments remain unchanged.
- Existing post-publication prescription management remains available from performance routes.
- Do not infer or fabricate historical preparation timestamps.

## Target Workflow

1. Staff select an active workout or plan.
2. Staff select teams and/or individual athletes and set the schedule.
3. Staff save the draft and choose **Prepare assignment**.
4. The server resolves recipients, captures team scope, and snapshots the source atomically.
5. Staff review the frozen audience and shared base prescription.
6. Staff individualize prescribed fields for athletes who should not inherit the base value.
7. Staff review effective prescriptions and any validation or roster warnings.
8. Staff publish the prepared assignment.
9. Athletes see only their effective prescriptions and record results separately.
10. Authorized staff may adjust only future unstarted sessions after publication.

## Milestone 1: Lifecycle And Persistence

### Schema And Migration

- [x] Add `prepared` to the assignment status representation without rewriting existing statuses.
- [x] Add nullable `preparedAt` and `preparedByUserId` audit fields.
- [x] Add any version or reset audit fields required by the chosen transition implementation.
- [x] Ensure existing recipient, team-scope, workout-snapshot, plan-snapshot, and override tables support prepared assignments.
- [x] Add indexes needed to list or authorize prepared assignments without weakening organization scoping.
- [x] Preserve current foreign keys and cascading behavior when prepared data is reset.
- [x] Generate a forward-only Drizzle migration; do not modify an applied migration.
- [x] Update inferred types, status unions, Zod schemas, fixtures, and factories.

### Domain Transitions

- [x] Add one module-owned transition guard for valid assignment status changes.
- [x] Implement `prepareAssignment` as one transaction that resolves recipients, snapshots the source, records team scope, and marks the assignment prepared.
- [x] Move recipient materialization and source snapshot creation out of `publishAssignment` for new draft assignments.
- [x] Make `publishAssignment` require prepared state and reuse the prepared recipients and snapshots.
- [x] Implement `returnPreparedAssignmentToDraft` as one transaction that clears prepared artifacts and records the reset.
- [x] Permit canceling a prepared assignment without exposing it to athletes.
- [x] Reject duplicate preparation, direct draft publication, preparation of canceled/published assignments, and reset of published assignments.
- [x] Enforce optimistic concurrency on prepare, reset, publish, and cancel transitions.
- [x] Revalidate active source status and organization ownership during preparation.
- [x] Revalidate actor scope and recipient eligibility during publication.

### Acceptance Criteria

- [x] Preparing an assignment creates one immutable shared snapshot and a deduplicated reviewed recipient list without athlete visibility.
- [x] Publishing does not recreate or alter the prepared source snapshot.
- [x] Returning to draft removes all prepared artifacts and allows source, schedule, and targets to be edited again.
- [x] A failed transition leaves the previous assignment state and related records unchanged.
- [x] Existing published assignments continue to function without data rewriting.

## Milestone 2: Preparation Review And Individualization

### Staff Workflow

- [ ] Replace the draft **Publish** action with **Prepare assignment**.
- [ ] Explain that preparation freezes source, schedule, targets, and recipients for review but remains invisible to athletes.
- [ ] Add a prepared assignment review page or prepared mode on the assignment detail page.
- [ ] Show source, schedule, target selections, resolved recipient count, and snapshot version/provenance.
- [ ] Show each recipient's name, captured team scope, base prescription, individualized fields, and effective prescription.
- [ ] Group plan prescriptions by workout slot and exercise order.
- [ ] Clearly distinguish inherited values from individualized values without relying on color alone.
- [ ] Add create, edit, clear-field, and clear-all controls for individual prescriptions.
- [ ] Provide recipient and exercise filters so large assignments remain navigable.
- [ ] Support applying one field value to a selected set of prepared recipients while writing separate recipient-scoped overrides.
- [ ] Preview the affected athletes and require confirmation for multi-recipient changes.
- [ ] Show counts for fully inherited, individualized, invalid, and no-longer-eligible recipients.
- [ ] Add **Return to draft** and **Publish assignment** as separate, clearly described actions.
- [ ] Disable publication while validation errors or unauthorized recipients remain.
- [ ] Preserve keyboard navigation, useful labels, visible focus, screen-reader status messages, and responsive staff layouts.

### Server Actions And Validation

- [ ] Add prepared-assignment prescription actions at the assignment module boundary.
- [ ] Reuse the existing prescription field schemas, load normalization, and effective-prescription resolver.
- [ ] Authorize every write against active organization, assignment state, recipient, athlete, item snapshot, plan slot, and staff scope.
- [ ] Reject client-supplied organization identity, normalized load, or effective values.
- [ ] Support atomic multi-recipient changes with a bounded recipient limit and all-or-nothing validation.
- [ ] Retain field-level inheritance semantics and remove override rows that become empty.
- [ ] Store actor, timestamp, optional reason, and optimistic version without logging prescription values.
- [ ] Revalidate only affected assignment and staff review routes.

### Acceptance Criteria

- [ ] A coach can prepare one shared workout for a team and set different loads or reps for individual athletes before publication.
- [ ] Individualizing one athlete never changes the shared snapshot or another athlete's effective prescription.
- [ ] A multi-recipient edit produces independently scoped overrides and an accurate preview.
- [ ] Staff can determine exactly what every athlete will see before publishing.
- [ ] Prepared assignments remain absent from every athlete-facing route and count.

## Milestone 3: Publication Safety And Post-Publication Continuity

### Recipient And Roster Validation

- [ ] Compare prepared recipient eligibility and actor scope with current organization/team state at publication.
- [ ] Define and implement the approved stale-roster policy without silently adding athletes.
- [ ] Identify ineligible recipients by name to authorized staff without exposing unrelated organization members.
- [ ] Prevent a Team Manager from publishing to an athlete outside the manager's current team scope.
- [ ] Preserve the prepared captured-team scope as historical delivery scope after successful publication.
- [ ] Keep direct-athlete recipients distinct from team-derived recipients in review and historical scope.

### Session Behavior

- [ ] Verify athletes receive the prepared effective prescription after publication.
- [ ] Preserve current effective-prescription snapshot creation when a session starts.
- [ ] Preserve current locking behavior for in-progress and submitted sessions.
- [ ] Keep post-publication changes limited to future unstarted sessions.
- [ ] Keep athlete result entry separate from prescribed values and never prefill results as completed work.
- [ ] Preserve assignment cancellation, occurrence generation, compliance, timeliness, and training-load calculations.

### Acceptance Criteria

- [ ] Publication is blocked when the actor or any recipient no longer satisfies authorization policy.
- [ ] Team roster changes never silently expand a prepared assignment.
- [ ] The prescription reviewed before publication matches the prescription initially shown to each athlete.
- [ ] Later overrides affect only allowed future unstarted sessions.
- [ ] Historical comparisons continue to use the effective prescription captured at session start.

## Milestone 4: Tests And Verification

### Unit Tests

- [ ] Cover every allowed and rejected assignment status transition.
- [ ] Cover base-plus-override resolution for every supported field.
- [ ] Cover empty override removal and field-level inheritance.
- [ ] Cover prepared-recipient validation and stale-roster policy decisions.
- [ ] Cover terminology-sensitive serializers or view models that distinguish prescription, result, and metric.

### Integration Tests

- [ ] Preparation atomically creates recipients, captured team scopes, source snapshots, and audit fields.
- [ ] Preparation rollback leaves no partial recipient or snapshot records.
- [ ] Returning to draft atomically clears prepared artifacts and overrides.
- [ ] Publication reuses prepared records and does not duplicate snapshots or recipients.
- [ ] Existing published assignment fixtures remain readable and operational.
- [ ] Organization Owner and Manager can prepare and publish within organization scope.
- [ ] Team Manager can prepare and publish only within managed-team scope.
- [ ] Athlete, Viewer, unmanaged Team Manager, foreign organization, and foreign team attempts fail safely.
- [ ] Concurrent lifecycle and prescription edits return actionable conflicts.
- [ ] Multi-recipient changes cannot cross organization or assignment boundaries.

### Component And Browser Tests

- [ ] Draft review offers preparation rather than direct publication.
- [ ] Prepared review displays frozen recipients and source prescriptions.
- [ ] Staff can individualize one athlete and observe the effective value without changing another athlete.
- [ ] Staff can apply a field to selected recipients after confirming the preview.
- [ ] Returning to draft warns about and removes individual prescriptions.
- [ ] Publication errors identify actionable roster or authorization changes.
- [ ] Prepared assignments do not appear in athlete navigation, assignment lists, or occurrence routes.
- [ ] Published assignments show the reviewed effective prescription to each athlete.
- [ ] Keyboard-only and mobile viewport workflows remain usable.

### Required Verification

- [ ] Run the narrow assignment and prescription unit/integration tests during implementation.
- [ ] Run the relevant assignment, tenant-isolation, role-access, and performance Playwright specs.
- [ ] Run `npm run validate`.
- [ ] Run `npm run build`.

## Milestone 5: Documentation And Rollout

### Documentation Updates

- [ ] Update [app-functionality.md](../app-functionality.md) to describe `draft → prepared → published`, pre-publication individualization, and post-publication future-session changes.
- [ ] Remove or revise the blanket template-and-fork customization guidance in [app-functionality.md](../app-functionality.md).
- [ ] Document that forks are for reusable template variants while assignment overrides are for recipient-specific prescriptions.
- [ ] Update [access-control.md](../access-control.md) with prepare, reset, individualize, and publish authorization rules.
- [ ] Update [design-philosophy.md](../design-philosophy.md) with the shared-structure, individual-prescription principle and review-before-release expectation.
- [ ] Update [performance-kpi-recommendations.md](../performance-kpi-recommendations.md) where needed to distinguish prescriptions, results, and derived metrics.
- [ ] Update the completed Phase 4 checklist only with a short cross-reference or clarification; do not rewrite its historical implementation record.
- [ ] Update route descriptions, empty states, confirmation copy, and staff-facing help text to use the approved terminology.
- [ ] Add migration and deployment notes if the new status requires coordinated application/database rollout.

### Rollout Safety

- [ ] Deploy the additive status and nullable audit fields before code paths can write `prepared`.
- [ ] Ensure mixed-version application instances cannot publish a prepared assignment through the old draft-only path.
- [ ] Verify no background process, query, or dashboard treats every non-draft assignment as athlete-visible.
- [ ] Verify analytics and audit consumers handle the new status explicitly.
- [ ] Add operational guidance for recovering a prepared assignment after a failed publication attempt.

### Final Acceptance Criteria

- [ ] Coaches reuse shared plans and workouts without creating athlete-named library duplicates for ordinary prescription differences.
- [ ] Coaches can review and individualize every recipient's prescription before athlete visibility.
- [ ] Athletes see effective prescriptions and record results through clearly separate workflows.
- [ ] Assignment history remains immutable once sessions start.
- [ ] Tenant isolation and staff scope are independently enforced for every lifecycle and prescription mutation.
- [ ] Product documentation consistently distinguishes templates, prescriptions, results, and metrics.

## Open Product Decisions To Resolve Before Implementation

- [ ] When a team roster changes after preparation, may authorized staff keep the originally prepared eligible recipients, or must they always return to draft and prepare again?
- [ ] Should multi-recipient editing ship in the first release, or is recipient-by-recipient editing acceptable for the initial cohort size?
- [ ] Should the prepared review use a recipient-first layout, an exercise-first matrix, or offer both views?
- [ ] Is an optional coach reason required for pre-publication changes, or only for post-publication changes?
- [ ] Should a prepared assignment have an expiration or stale-review warning after a defined period?
- [ ] Should per-occurrence prescription overrides become the next phase for progressive plan loading?
