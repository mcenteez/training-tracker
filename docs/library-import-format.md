# Library Import Format

Coaches can bulk-create exercises, workouts, and plans by uploading or pasting a single JSON document at `/app/library/import`. The intended workflow is to ask an AI assistant to generate programming against this format, then review the preview before anything is saved.

Importing requires library **manage** access: an organization owner or manager, or a team manager. See [access-control.md](./access-control.md).

## Schema

The machine-readable contract is served from the running app:

```
GET /schemas/library-import/v1.json
```

It is public, cacheable, CORS-enabled, and generated at request time from the same Zod schema that validates uploads, so it can never drift from the validator. Point an AI agent or a JSON-aware editor at that URL.

The version lives in the path. Additive changes stay on `v1`; a breaking change would ship as `v2.json` while `v1.json` continues to be served.

## Document shape

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
              "tempo": "31X1"
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
          "scheduleType": "fixed_day",
          "workout": "Lower Body A",
          "dayOfWeek": "monday",
          "label": "Main lift day"
        },
        {
          "scheduleType": "weekly_frequency",
          "workout": "Conditioning A",
          "targetSessionsPerWeek": 2
        }
      ]
    }
  ]
}
```

- `formatVersion` is required and must be `1`.
- `$schema` is optional and ignored.
- `exercises`, `workouts`, and `plans` are each optional, but at least one must be non-empty.
- Unknown keys are rejected, so a field an AI invents surfaces as an error instead of being silently dropped.
- Optional fields may be omitted or set to `null`.

### Enumerated values

| Field                                  | Allowed values                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `exercises[].category`                 | `strength`, `power`, `conditioning`, `mobility`, `warmup`, `recovery`, `other` |
| `workouts[].blocks[].type`             | `straight`, `circuit`, `superset`                                              |
| `plans[].scheduleSlots[].scheduleType` | `fixed_day`, `weekly_frequency`                                                |
| `plans[].scheduleSlots[].dayOfWeek`    | `monday` through `sunday`                                                      |

## Rules the schema cannot express

Both are enforced on import and reported as errors:

1. Every workout item needs at least one of `reps`, `load`, `durationSeconds`, `distanceMeters`, `restSeconds`, `tempo`, or `notes`.
2. A plan slot uses either `scheduleType: "fixed_day"` with `dayOfWeek`, or `scheduleType: "weekly_frequency"` with `targetSessionsPerWeek`. Never both, and never neither.

## References

The document contains no identifiers. Workout items name an exercise, and plan slots name a workout.

- A reference resolves against any entity in the same document, or any matching record already in the organization's library. Order within the file does not matter.
- Matching is case-insensitive and ignores surrounding whitespace.
- Exercises resolve against active exercises; workouts resolve against unarchived workouts.
- A reference that resolves to nothing is an error. Nothing is auto-created to satisfy it.

## Names that already exist

- An entity whose name already exists is reported as a warning and skipped. Other entities in the file still import, and references to the skipped name point at the existing record.
- A name repeated within the same file is an error.
- Import never updates or overwrites an existing record.

## What gets created

- Exercises are created active.
- Workouts and plans are created as **drafts**. An import is unreviewed content, so a coach must open and activate it before it can be assigned to athletes.
- Ordering of blocks, items, and schedule slots follows array order. A `position` field is rejected.

## Limits

| Limit                   | Value            |
| ----------------------- | ---------------- |
| Document size           | 512 KB           |
| Exercises               | 500              |
| Workouts                | 200              |
| Plans                   | 50               |
| Blocks per workout      | 30               |
| Items per block         | 50               |
| Schedule slots per plan | 300              |
| Name length             | 2–120 characters |
| Description length      | 2000 characters  |
| Instructions length     | 4000 characters  |
| Rounds per block        | 1–100            |
| `targetSessionsPerWeek` | 1–14             |

## AI prompt template

The import page renders a copyable prompt with the schema URL for the current host already filled in. It instructs the assistant to fetch the schema, validate against it, and return only the JSON document.

## Import behavior

1. Upload a file or paste JSON, then submit to preview. Nothing is written.
2. The preview lists every entity with its outcome (will be created, or already exists and skipped) plus any errors and warnings.
3. Commit is offered only when there are no errors and at least one entity would be created.
4. The commit runs in a single transaction. If any part fails, nothing is imported.
5. Existing names are re-read inside the commit transaction, so a record created by someone else while you were reviewing cannot slip past the preview.
