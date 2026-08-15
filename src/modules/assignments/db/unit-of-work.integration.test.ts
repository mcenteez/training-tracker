import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/client";
import {
  cancelAssignment,
  createAssignment,
  prepareAssignment,
  publishAssignment,
  returnPreparedAssignmentToDraft,
  type AssignmentUnitOfWork,
} from "@/modules/assignments/application/assignment-service";
import type { Assignment } from "@/modules/assignments/db/schema";
import {
  resetAssignmentSession,
  startAssignmentSession,
  autosaveAssignmentSessionResults,
  submitAssignmentSession,
} from "@/modules/assignments/application/assignment-session-service";
import {
  clearAthletePrescriptionOverride,
  saveAthletePrescriptionOverride,
} from "@/modules/assignments/application/athlete-prescription-service";
import { createAthletePrescriptionUnitOfWork } from "@/modules/assignments/db/athlete-prescription-unit-of-work";
import {
  findPublishedAssignmentForAthlete,
  listAssignmentsForOrganization,
  listEffectiveWorkoutItemsForAthleteOccurrence,
  listPlanSlotSnapshotsForAthleteAssignment,
  listPublishedAssignmentsForAthlete,
  listSessionResultsForAthleteAssignment,
  listSessionsForAthleteAssignment,
} from "@/modules/assignments/db/queries";
import {
  listAssignmentAthletePrescriptionItems,
  listAssignmentPrescriptionRecipients,
} from "@/modules/assignments/db/athlete-prescription-queries";
import { createAssignmentSessionUnitOfWork } from "@/modules/assignments/db/session-unit-of-work";
import { createAssignmentUnitOfWork } from "@/modules/assignments/db/unit-of-work";

const migrationsRootPath = resolve(process.cwd(), "drizzle");

async function applyMigrations(database: PGlite) {
  const migrationDirectories = (
    await readdir(migrationsRootPath, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const directory of migrationDirectories) {
    const migration = await readFile(
      resolve(migrationsRootPath, directory, "migration.sql"),
      "utf8",
    );

    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        await database.exec(statement);
      }
    }
  }
}

async function prepareAndPublishAssignment(
  unitOfWork: AssignmentUnitOfWork,
  draft: Assignment,
): Promise<Assignment> {
  const prepared = await prepareAssignment(unitOfWork, {
    organizationId: draft.organizationId,
    actorUserId: "00000000-0000-4000-8000-000000000001",
    assignmentId: draft.id,
    expectedVersion: draft.version,
  });

  return publishAssignment(unitOfWork, {
    organizationId: draft.organizationId,
    actorUserId: "00000000-0000-4000-8000-000000000001",
    assignmentId: draft.id,
    expectedVersion: prepared.version,
  });
}

describe("assignment unit of work", () => {
  let client: PGlite;
  let database: Database;

  beforeEach(async () => {
    client = new PGlite();
    await client.waitReady;
    await applyMigrations(client);
    database = drizzle({ client }) as unknown as Database;

    await client.exec(`
      INSERT INTO users (id, clerk_user_id, email)
      VALUES
        ('00000000-0000-4000-8000-000000000001', 'manager', 'manager@example.com'),
        ('00000000-0000-4000-8000-000000000002', 'athlete', 'athlete@example.com');

      INSERT INTO organizations (id, name, timezone)
      VALUES ('10000000-0000-4000-8000-000000000001', 'North High', 'UTC');

      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES
        ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'manager'),
        ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'athlete');

      INSERT INTO teams (id, organization_id, name)
      VALUES
        ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Managed Team'),
        ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Outside Team');

      INSERT INTO team_memberships (organization_id, team_id, user_id, role)
      VALUES
        ('10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'manager'),
        ('10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'athlete');

      INSERT INTO exercises (
        id, organization_id, name, instructions, category, equipment, status
      ) VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Back Squat',
        'Brace before descending',
        'strength',
        ARRAY['barbell'],
        'active'
      );

      INSERT INTO workouts (
        id, organization_id, name, description, status, version
      ) VALUES (
        '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Lower Strength',
        'Primary lower session',
        'active',
        3
      );

      INSERT INTO workout_blocks (
        id, organization_id, workout_id, type, label, rounds, position
      ) VALUES (
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'straight',
        'Main Lift',
        4,
        0
      );

      INSERT INTO workout_items (
        id, organization_id, workout_id, block_id, exercise_id, position,
        reps, load, rest_seconds, tempo, notes
      ) VALUES (
        '50000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        0,
        5,
        '75%',
        180,
        '31X1',
        'Move with intent'
      );
    `);
  });

  afterEach(async () => {
    await client.close();
  });

  it("keeps prepared assignments hidden and clears prepared artifacts on reset", async () => {
    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "workout",
        sourceWorkoutId: "30000000-0000-4000-8000-000000000001",
        scheduledDate: "2026-08-20",
        availableFrom: null,
        availableUntil: null,
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });

    const prepared = await prepareAssignment(unitOfWork, {
      organizationId: draft.organizationId,
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: draft.version,
    });
    const athleteAssignments = await listPublishedAssignmentsForAthlete(
      database,
      {
        organizationId: draft.organizationId,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
      },
    );

    expect(prepared).toEqual(
      expect.objectContaining({
        status: "prepared",
        preparedByUserId: "00000000-0000-4000-8000-000000000001",
      }),
    );
    expect(prepared.preparedAt).toBeInstanceOf(Date);
    expect(athleteAssignments).toEqual([]);

    const reset = await returnPreparedAssignmentToDraft(unitOfWork, {
      organizationId: draft.organizationId,
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: prepared.version,
    });
    const artifacts = await client.query<{
      recipient_count: number;
      snapshot_count: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM assignment_recipients WHERE assignment_id = '${draft.id}') AS recipient_count,
        (SELECT count(*)::int FROM assignment_workout_snapshots WHERE assignment_id = '${draft.id}') AS snapshot_count;
    `);

    expect(reset).toEqual(
      expect.objectContaining({
        status: "draft",
        preparedAt: null,
        preparedByUserId: null,
        preparationResetByUserId: "00000000-0000-4000-8000-000000000001",
      }),
    );
    expect(reset.preparationResetAt).toBeInstanceOf(Date);
    expect(artifacts.rows).toEqual([{ recipient_count: 0, snapshot_count: 0 }]);
  });

  it("publishes plan snapshots preserving both scheduling modes", async () => {
    await client.exec(`
      INSERT INTO plans (id, organization_id, name, status)
      VALUES ('61000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Mixed Plan', 'active');

      INSERT INTO plan_schedule_slots (
        organization_id, plan_id, workout_id, schedule_type, day_of_week, target_sessions_per_week, position, label
      ) VALUES
        ('10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'fixed_day', 'monday', NULL, 0, 'Strength'),
        ('10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'weekly_frequency', NULL, 2, 1, 'Conditioning');
    `);

    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "plan",
        sourcePlanId: "61000000-0000-4000-8000-000000000001",
        startDate: "2026-08-17",
        endDate: "2026-09-06",
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });

    await prepareAndPublishAssignment(unitOfWork, draft);

    const recipientScopes = await client.query<{ team_id: string }>(`
      SELECT scope.team_id
      FROM assignment_recipient_team_scopes scope
      WHERE scope.assignment_id = '${draft.id}';
    `);
    expect(recipientScopes.rows).toEqual([
      { team_id: "80000000-0000-4000-8000-000000000001" },
    ]);

    const slotSnapshots = await client.query<{
      schedule_type: string;
      day_of_week: string | null;
      target_sessions_per_week: number | null;
      position: number;
      label: string | null;
    }>(`
      SELECT schedule_type, day_of_week, target_sessions_per_week, position, label
      FROM assignment_plan_slot_snapshots
      WHERE assignment_id = '${draft.id}'
      ORDER BY position ASC;
    `);

    expect(slotSnapshots.rows).toEqual([
      {
        schedule_type: "fixed_day",
        day_of_week: "monday",
        target_sessions_per_week: null,
        position: 0,
        label: "Strength",
      },
      {
        schedule_type: "weekly_frequency",
        day_of_week: null,
        target_sessions_per_week: 2,
        position: 1,
        label: "Conditioning",
      },
    ]);

    await client.exec(`
      UPDATE plan_schedule_slots
      SET schedule_type = 'weekly_frequency', day_of_week = NULL, target_sessions_per_week = 5
      WHERE plan_id = '61000000-0000-4000-8000-000000000001' AND position = 0;
    `);

    const afterEdit = await client.query<{ day_of_week: string | null }>(`
      SELECT day_of_week
      FROM assignment_plan_slot_snapshots
      WHERE assignment_id = '${draft.id}' AND position = 0;
    `);

    expect(afterEdit.rows).toEqual([{ day_of_week: "monday" }]);
  });

  it("returns plan slot snapshots only to the assignment recipient", async () => {
    await client.exec(`
      INSERT INTO plans (id, organization_id, name, status)
      VALUES ('61000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Recipient Plan', 'active');

      INSERT INTO plan_schedule_slots (
        organization_id, plan_id, workout_id, schedule_type, day_of_week, position
      ) VALUES
        ('10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'fixed_day', 'wednesday', 0);
    `);

    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "plan",
        sourcePlanId: "61000000-0000-4000-8000-000000000002",
        startDate: "2026-08-17",
        endDate: "2026-08-30",
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });

    await prepareAndPublishAssignment(unitOfWork, draft);

    const recipientSlots = await listPlanSlotSnapshotsForAthleteAssignment(
      database,
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
      },
    );
    const outsiderSlots = await listPlanSlotSnapshotsForAthleteAssignment(
      database,
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000001",
      },
    );

    expect(recipientSlots).toEqual([
      expect.objectContaining({
        scheduleType: "fixed_day",
        dayOfWeek: "wednesday",
        workoutName: "Lower Strength",
      }),
    ]);
    expect(outsiderSlots).toEqual([]);
  });

  it("creates distinct occurrence sessions for a flexible plan workout", async () => {
    await client.exec(`
      INSERT INTO plans (id, organization_id, name, status)
      VALUES ('61000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Flexible Plan', 'active');

      INSERT INTO plan_schedule_slots (
        organization_id, plan_id, workout_id, schedule_type, target_sessions_per_week, position
      ) VALUES
        ('10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'weekly_frequency', 2, 0);
    `);

    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "plan",
        sourcePlanId: "61000000-0000-4000-8000-000000000003",
        startDate: "2026-08-10",
        endDate: "2026-08-30",
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });

    await prepareAndPublishAssignment(unitOfWork, draft);

    const slotRows = await client.query<{ id: string }>(`
      SELECT id FROM assignment_plan_slot_snapshots
      WHERE assignment_id = '${draft.id}';
    `);
    const slotId = slotRows.rows[0]!.id;
    const overrideTargetRows = await client.query<{
      recipient_id: string;
      item_snapshot_id: string;
    }>(`
      SELECT
        assignment_recipients.id AS recipient_id,
        assignment_workout_item_snapshots.id AS item_snapshot_id
      FROM assignment_recipients
      INNER JOIN assignment_workout_item_snapshots
        ON assignment_workout_item_snapshots.assignment_id = assignment_recipients.assignment_id
      WHERE assignment_recipients.assignment_id = '${draft.id}'
      LIMIT 1;
    `);
    const overrideTarget = overrideTargetRows.rows[0]!;
    const overrideUnitOfWork = createAthletePrescriptionUnitOfWork(database);
    await saveAthletePrescriptionOverride(overrideUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      recipientId: overrideTarget.recipient_id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      itemSnapshotId: overrideTarget.item_snapshot_id,
      planSlotSnapshotId: slotId,
      expectedVersion: null,
      overriddenFields: ["reps"],
      reps: 20,
      load: null,
      loadValue: null,
      loadUnit: null,
      normalizedLoadKg: null,
      durationSeconds: null,
      distanceMeters: null,
      restSeconds: null,
      tempo: null,
      notes: null,
      reason: "First progression",
    });
    const sessionUnitOfWork = createAssignmentSessionUnitOfWork(database);

    const first = await startAssignmentSession(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      planSlotSnapshotId: slotId,
      scheduledDate: "2026-08-10",
      now: new Date("2026-08-10T12:00:00.000Z"),
    });
    const firstAgain = await startAssignmentSession(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      planSlotSnapshotId: slotId,
      scheduledDate: "2026-08-10",
      now: new Date("2026-08-10T12:30:00.000Z"),
    });
    await client.exec(`
      UPDATE assignment_sessions
      SET status = 'submitted', submitted_at = '2026-08-10T13:00:00.000Z'
      WHERE id = '${first.id}';
    `);
    await saveAthletePrescriptionOverride(overrideUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      recipientId: overrideTarget.recipient_id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      itemSnapshotId: overrideTarget.item_snapshot_id,
      planSlotSnapshotId: slotId,
      expectedVersion: 1,
      overriddenFields: ["reps"],
      reps: 25,
      load: null,
      loadValue: null,
      loadUnit: null,
      normalizedLoadKg: null,
      durationSeconds: null,
      distanceMeters: null,
      restSeconds: null,
      tempo: null,
      notes: null,
      reason: "Later progression",
    });
    const second = await startAssignmentSession(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      planSlotSnapshotId: slotId,
      scheduledDate: "2026-08-12",
      now: new Date("2026-08-12T12:00:00.000Z"),
    });
    expect(first.id).not.toBe(second.id);
    expect(firstAgain.id).toBe(first.id);
    expect(first.planSlotSnapshotId).toBe(slotId);

    const immutablePlanPrescriptions = await client.query<{
      session_id: string;
      reps: number;
    }>(`
      SELECT session_id, reps
      FROM assignment_session_effective_item_prescriptions
      WHERE session_id IN ('${first.id}', '${second.id}')
      ORDER BY session_id;
    `);
    expect(
      immutablePlanPrescriptions.rows.toSorted((left, right) =>
        left.session_id === first.id
          ? -1
          : right.session_id === first.id
            ? 1
            : 0,
      ),
    ).toEqual([
      { session_id: first.id, reps: 20 },
      { session_id: second.id, reps: 25 },
    ]);

    await clearAthletePrescriptionOverride(overrideUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      recipientId: overrideTarget.recipient_id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      itemSnapshotId: overrideTarget.item_snapshot_id,
      planSlotSnapshotId: slotId,
      expectedVersion: 2,
    });
    const afterClearPrescriptions = await client.query<{
      session_id: string;
      reps: number;
    }>(`
      SELECT session_id, reps
      FROM assignment_session_effective_item_prescriptions
      WHERE session_id IN ('${first.id}', '${second.id}');
    `);
    expect(
      afterClearPrescriptions.rows.toSorted((left, right) =>
        left.session_id === first.id
          ? -1
          : right.session_id === first.id
            ? 1
            : 0,
      ),
    ).toEqual([
      { session_id: first.id, reps: 20 },
      { session_id: second.id, reps: 25 },
    ]);

    await expect(
      startAssignmentSession(sessionUnitOfWork, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        planSlotSnapshotId: slotId,
        scheduledDate: "2026-08-13",
        now: new Date("2026-08-13T12:00:00.000Z"),
      }),
    ).rejects.toThrow(/weekly target/);
  });

  it("publishes a session-ready immutable workout snapshot", async () => {
    await client.exec(`
      UPDATE workout_items
      SET load = '135 lb',
          load_value = 135,
          load_unit = 'lb',
          normalized_load_kg = 61.23496995
      WHERE id = '50000000-0000-4000-8000-000000000001';
    `);
    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "workout",
        sourceWorkoutId: "30000000-0000-4000-8000-000000000001",
        scheduledDate: "2026-08-12",
        availableFrom: "2026-08-12T00:00:00.000Z",
        availableUntil: "2026-08-13T00:00:00.000Z",
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });

    await prepareAndPublishAssignment(unitOfWork, draft);

    await client.exec(`
      UPDATE workout_items
      SET load = '100 kg',
          load_value = 100,
          load_unit = 'kg',
          normalized_load_kg = 100
      WHERE id = '50000000-0000-4000-8000-000000000001';
    `);

    const workoutSnapshots = await client.query<{
      source_workout_version: number;
      name: string;
    }>(`
      SELECT source_workout_version, name
      FROM assignment_workout_snapshots
      WHERE assignment_id = '${draft.id}';
    `);
    const blockSnapshots = await client.query<{
      label: string;
      rounds: number;
    }>(`
      SELECT label, rounds
      FROM assignment_workout_block_snapshots
      WHERE assignment_id = '${draft.id}';
    `);
    const itemSnapshots = await client.query<{
      exercise_name: string;
      reps: number;
      load: string;
      load_value: string;
      load_unit: string;
      normalized_load_kg: string;
      exercise_instructions: string;
    }>(`
      SELECT
        exercise_name,
        reps,
        load,
        load_value,
        load_unit,
        normalized_load_kg,
        exercise_instructions
      FROM assignment_workout_item_snapshots
      WHERE assignment_id = '${draft.id}';
    `);

    expect(workoutSnapshots.rows).toEqual([
      { source_workout_version: 3, name: "Lower Strength" },
    ]);
    expect(blockSnapshots.rows).toEqual([{ label: "Main Lift", rounds: 4 }]);
    expect(itemSnapshots.rows).toEqual([
      {
        exercise_name: "Back Squat",
        reps: 5,
        load: "135 lb",
        load_value: "135",
        load_unit: "lb",
        normalized_load_kg: "61.23496995",
        exercise_instructions: "Brace before descending",
      },
    ]);
  });

  it("preserves legacy text loads and enforces nullable structured load and session constraints", async () => {
    const legacyLoad = await client.query<{
      load: string;
      load_value: string | null;
      load_unit: string | null;
      normalized_load_kg: string | null;
    }>(`
      SELECT load, load_value, load_unit, normalized_load_kg
      FROM workout_items
      WHERE id = '50000000-0000-4000-8000-000000000001';
    `);
    expect(legacyLoad.rows).toEqual([
      {
        load: "75%",
        load_value: null,
        load_unit: null,
        normalized_load_kg: null,
      },
    ]);

    await expect(
      client.exec(`
        UPDATE workout_items
        SET load_value = 135
        WHERE id = '50000000-0000-4000-8000-000000000001';
      `),
    ).rejects.toThrow(/structured_load_complete/);
    await client.exec(`
      UPDATE workout_items
      SET load = '135 lb',
          load_value = 135,
          load_unit = 'lb',
          normalized_load_kg = 61.23496995
      WHERE id = '50000000-0000-4000-8000-000000000001';
    `);

    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "workout",
        sourceWorkoutId: "30000000-0000-4000-8000-000000000001",
        scheduledDate: "2026-08-12",
        availableFrom: null,
        availableUntil: null,
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });
    await prepareAndPublishAssignment(unitOfWork, draft);
    const session = await startAssignmentSession(
      createAssignmentSessionUnitOfWork(database),
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        now: new Date("2026-08-12T12:00:00.000Z"),
      },
    );

    await expect(
      client.exec(`
        UPDATE assignment_sessions
        SET duration_minutes = -1
        WHERE id = '${session.id}';
      `),
    ).rejects.toThrow(/duration_nonnegative/);
    await expect(
      client.exec(`
        UPDATE assignment_sessions
        SET session_rpe = 11
        WHERE id = '${session.id}';
      `),
    ).rejects.toThrow(/rpe_bounds/);
    await client.exec(`
      UPDATE assignment_sessions
      SET duration_minutes = 45, session_rpe = 8
      WHERE id = '${session.id}';
    `);
    const validSessionLoad = await client.query<{
      duration_minutes: number;
      session_rpe: number;
    }>(`
      SELECT duration_minutes, session_rpe
      FROM assignment_sessions
      WHERE id = '${session.id}';
    `);
    expect(validSessionLoad.rows).toEqual([
      { duration_minutes: 45, session_rpe: 8 },
    ]);
  });

  it("stores distinct recipient overrides without changing the shared snapshot", async () => {
    await client.exec(`
      INSERT INTO users (id, clerk_user_id, email)
      VALUES ('00000000-0000-4000-8000-000000000003', 'athlete-two', 'athlete-two@example.com');

      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'athlete');
    `);
    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "workout",
        sourceWorkoutId: "30000000-0000-4000-8000-000000000001",
        scheduledDate: "2026-08-12",
        availableFrom: null,
        availableUntil: null,
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000003",
        },
      ],
    });
    const prepared = await prepareAssignment(unitOfWork, {
      organizationId: draft.organizationId,
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: draft.version,
    });
    const [reviewRecipients, reviewItems] = await Promise.all([
      listAssignmentPrescriptionRecipients(database, {
        organizationId: draft.organizationId,
        assignmentId: draft.id,
      }),
      listAssignmentAthletePrescriptionItems(database, {
        organizationId: draft.organizationId,
        assignmentId: draft.id,
      }),
    ]);
    expect(reviewRecipients).toHaveLength(2);
    expect(reviewRecipients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          athleteUserId: "00000000-0000-4000-8000-000000000003",
          teamIds: [],
        }),
      ]),
    );
    expect(reviewItems).toHaveLength(2);
    const recipients = await client.query<{
      id: string;
      athlete_user_id: string;
    }>(`
      SELECT id, athlete_user_id
      FROM assignment_recipients
      WHERE assignment_id = '${draft.id}';
    `);
    const itemRows = await client.query<{ id: string }>(`
      SELECT id
      FROM assignment_workout_item_snapshots
      WHERE assignment_id = '${draft.id}';
    `);
    const itemSnapshotId = itemRows.rows[0]!.id;
    const overrideUnitOfWork = createAthletePrescriptionUnitOfWork(database);

    for (const [index, recipient] of recipients.rows.entries()) {
      await saveAthletePrescriptionOverride(overrideUnitOfWork, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        actorUserId: "00000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        recipientId: recipient.id,
        athleteUserId: recipient.athlete_user_id,
        itemSnapshotId,
        planSlotSnapshotId: null,
        expectedVersion: null,
        overriddenFields: ["reps"],
        reps: index === 0 ? 10 : 20,
        load: null,
        loadValue: null,
        loadUnit: null,
        normalizedLoadKg: null,
        durationSeconds: null,
        distanceMeters: null,
        restSeconds: null,
        tempo: null,
        notes: null,
        reason: null,
      });
    }

    await publishAssignment(unitOfWork, {
      organizationId: draft.organizationId,
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: prepared.version,
    });

    const overrideRows = await client.query<{
      athlete_user_id: string;
      reps: number;
    }>(`
      SELECT athlete_user_id, reps
      FROM assignment_athlete_item_overrides
      WHERE assignment_id = '${draft.id}'
      ORDER BY reps;
    `);
    const sharedRows = await client.query<{ reps: number }>(`
      SELECT reps
      FROM assignment_workout_item_snapshots
      WHERE id = '${itemSnapshotId}';
    `);
    expect(overrideRows.rows.map((row) => row.reps)).toEqual([10, 20]);
    expect(
      new Set(overrideRows.rows.map((row) => row.athlete_user_id)).size,
    ).toBe(2);
    expect(sharedRows.rows).toEqual([{ reps: 5 }]);
  });

  it("limits team-manager assignment reads to wholly managed targets", async () => {
    await client.exec(`
      INSERT INTO assignments (
        id, organization_id, source_workout_id, timezone, scheduled_date
      ) VALUES
        ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'UTC', '2026-08-12'),
        ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'UTC', '2026-08-13'),
        ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'UTC', '2026-08-14'),
        ('60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'UTC', '2026-08-15');

      INSERT INTO assignment_targets (
        id, organization_id, assignment_id, target_type, team_id, athlete_user_id
      ) VALUES
        ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'team', '80000000-0000-4000-8000-000000000001', NULL),
        ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'team', '80000000-0000-4000-8000-000000000002', NULL),
        ('70000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'athlete', NULL, '00000000-0000-4000-8000-000000000002'),
        ('70000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'team', '80000000-0000-4000-8000-000000000001', NULL),
        ('70000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'team', '80000000-0000-4000-8000-000000000002', NULL);
    `);

    const visibleAssignments = await listAssignmentsForOrganization(database, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      managedTeamIds: ["80000000-0000-4000-8000-000000000001"],
    });

    expect(visibleAssignments.map((assignment) => assignment.id)).toEqual([
      "60000000-0000-4000-8000-000000000001",
      "60000000-0000-4000-8000-000000000003",
    ]);
  });

  it("keeps a canceled assignment visible when the athlete has a session", async () => {
    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "workout",
        sourceWorkoutId: "30000000-0000-4000-8000-000000000001",
        scheduledDate: "2026-08-12",
        availableFrom: null,
        availableUntil: null,
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });
    const published = await prepareAndPublishAssignment(unitOfWork, draft);

    await startAssignmentSession(createAssignmentSessionUnitOfWork(database), {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      now: new Date("2026-08-12T12:00:00.000Z"),
    });
    await cancelAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: published.version,
    });

    const athleteAssignments = await listPublishedAssignmentsForAthlete(
      database,
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        athleteUserId: "00000000-0000-4000-8000-000000000002",
      },
    );
    const detail = await findPublishedAssignmentForAthlete(database, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
    });

    expect(athleteAssignments).toEqual([
      expect.objectContaining({ id: draft.id, status: "canceled" }),
    ]);
    expect(detail).toEqual(
      expect.objectContaining({ id: draft.id, status: "canceled" }),
    );
  });

  it("resets an athlete session back to its initial state", async () => {
    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "workout",
        sourceWorkoutId: "30000000-0000-4000-8000-000000000001",
        scheduledDate: "2026-08-12",
        availableFrom: null,
        availableUntil: null,
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });
    await prepareAndPublishAssignment(unitOfWork, draft);

    await client.query(`
      UPDATE assignments
      SET timeliness_policy_effective_at = '2026-08-11T00:00:00.000Z'
      WHERE id = '${draft.id}';
    `);

    const started = await startAssignmentSession(
      createAssignmentSessionUnitOfWork(database),
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        now: new Date("2026-08-12T12:00:00.000Z"),
      },
    );

    expect(started.status).toBe("in_progress");
    expect(started.dueAt?.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(started.availableUntil.toISOString()).toBe(
      "2026-08-20T00:00:00.000Z",
    );

    const effectivePrescriptionRows = await client.query<{
      reps: number | null;
      load: string | null;
      source_override_id: string | null;
    }>(`
      SELECT reps, load, source_override_id
      FROM assignment_session_effective_item_prescriptions
      WHERE session_id = '${started.id}';
    `);

    expect(effectivePrescriptionRows.rows).toEqual([
      { reps: 5, load: "75%", source_override_id: null },
    ]);

    const itemSnapshots = await client.query<{
      id: string;
    }>(`
      SELECT id
      FROM assignment_workout_item_snapshots
      WHERE assignment_id = '${draft.id}'
      ORDER BY position ASC
      LIMIT 1;
    `);

    await autosaveAssignmentSessionResults(
      createAssignmentSessionUnitOfWork(database),
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        sessionId: started.id,
        expectedVersion: started.version,
        mutationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        now: new Date("2026-08-12T12:05:00.000Z"),
        durationMinutes: 45,
        sessionRpe: 8,
        results: [
          {
            itemSnapshotId: itemSnapshots.rows[0].id,
            completedAt: new Date("2026-08-12T12:05:00.000Z"),
            roundNumber: 1,
            reps: 5,
            load: "75%",
            durationSeconds: null,
            distanceMeters: null,
            notes: null,
          },
        ],
      },
    );

    const reset = await resetAssignmentSession(
      createAssignmentSessionUnitOfWork(database),
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        sessionId: started.id,
        expectedVersion: started.version + 1,
        now: new Date("2026-08-12T12:15:00.000Z"),
      },
    );

    const sessionRows = await client.query<{
      status: string;
      version: number;
      started_at: string | null;
      submitted_at: string | null;
      duration_minutes: number | null;
      session_rpe: number | null;
    }>(`
      SELECT status, version, started_at, submitted_at, duration_minutes, session_rpe
      FROM assignment_sessions
      WHERE id = '${started.id}';
    `);
    const resultRows = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM assignment_session_item_results
      WHERE session_id = '${started.id}';
    `);

    expect(reset.status).toBe("assigned");
    expect(sessionRows.rows).toEqual([
      {
        status: "assigned",
        version: 1,
        started_at: null,
        submitted_at: null,
        duration_minutes: null,
        session_rpe: null,
      },
    ]);
    expect(resultRows.rows).toEqual([{ count: 0 }]);
  });

  it("persists optional session response and measurable loads through retry, submit, reload, and completed edit", async () => {
    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "workout",
        sourceWorkoutId: "30000000-0000-4000-8000-000000000001",
        scheduledDate: "2026-08-12",
        availableFrom: null,
        availableUntil: null,
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });
    await prepareAndPublishAssignment(unitOfWork, draft);
    await client.query(`
      UPDATE assignments
      SET timeliness_policy_effective_at = '2026-08-11T00:00:00.000Z'
      WHERE id = '${draft.id}';
    `);

    const sessionUnitOfWork = createAssignmentSessionUnitOfWork(database);
    const started = await startAssignmentSession(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      now: new Date("2026-08-12T12:00:00.000Z"),
    });
    const itemRows = await client.query<{ id: string }>(`
      SELECT id
      FROM assignment_workout_item_snapshots
      WHERE assignment_id = '${draft.id}'
      LIMIT 1;
    `);
    const itemSnapshotId = itemRows.rows[0]!.id;
    const firstMutationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const saved = await autosaveAssignmentSessionResults(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      sessionId: started.id,
      expectedVersion: started.version,
      mutationId: firstMutationId,
      now: new Date("2026-08-12T12:10:00.000Z"),
      durationMinutes: 45,
      sessionRpe: 8,
      results: [
        {
          itemSnapshotId,
          completedAt: new Date("2026-08-12T12:10:00.000Z"),
          roundNumber: 1,
          reps: 5,
          load: null,
          loadValue: 135,
          loadUnit: "lb",
          durationSeconds: null,
          distanceMeters: null,
          notes: null,
        },
      ],
    });
    const retried = await autosaveAssignmentSessionResults(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      sessionId: started.id,
      expectedVersion: started.version,
      mutationId: firstMutationId,
      now: new Date("2026-08-12T12:11:00.000Z"),
      durationMinutes: 45,
      sessionRpe: 8,
      results: [],
    });
    expect(retried.version).toBe(saved.version);

    const submitted = await submitAssignmentSession(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      sessionId: started.id,
      expectedVersion: saved.version,
      now: new Date("2026-08-12T13:00:00.000Z"),
    });
    const originalSubmittedAt = submitted.submittedAt;
    const originalDueAt = submitted.dueAt;

    await autosaveAssignmentSessionResults(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      sessionId: started.id,
      expectedVersion: submitted.version,
      mutationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      now: new Date("2026-08-12T14:00:00.000Z"),
      durationMinutes: 50,
      sessionRpe: 9,
      allowSubmittedEdit: true,
      results: [
        {
          itemSnapshotId,
          completedAt: new Date("2026-08-12T12:10:00.000Z"),
          roundNumber: 1,
          reps: 5,
          load: null,
          loadValue: 100,
          loadUnit: "kg",
          durationSeconds: null,
          distanceMeters: null,
          notes: null,
        },
      ],
    });

    const [sessions, results] = await Promise.all([
      listSessionsForAthleteAssignment(database, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
      }),
      listSessionResultsForAthleteAssignment(database, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        sessionId: started.id,
      }),
    ]);
    expect(sessions).toEqual([
      expect.objectContaining({
        durationMinutes: 50,
        sessionRpe: 9,
        submittedAt: originalSubmittedAt,
      }),
    ]);
    expect(sessions[0]?.submittedAt).toEqual(originalSubmittedAt);
    expect(submitted.dueAt).toEqual(originalDueAt);
    expect(results).toEqual([
      expect.objectContaining({
        load: "100 kg",
        loadValue: "100",
        loadUnit: "kg",
        normalizedLoadKg: "100",
      }),
    ]);

    await expect(
      autosaveAssignmentSessionResults(sessionUnitOfWork, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000001",
        sessionId: started.id,
        expectedVersion: submitted.version + 1,
        mutationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        results: [],
      }),
    ).rejects.toThrow("permission");
  });

  it("applies an athlete prescription override without changing the shared snapshot", async () => {
    const unitOfWork = createAssignmentUnitOfWork(database);
    const draft = await createAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      timezone: "UTC",
      source: {
        sourceType: "workout",
        sourceWorkoutId: "30000000-0000-4000-8000-000000000001",
        scheduledDate: "2026-08-12",
        availableFrom: null,
        availableUntil: null,
      },
      targets: [
        {
          targetType: "athlete",
          athleteUserId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });
    await prepareAndPublishAssignment(unitOfWork, draft);

    const recipientRows = await client.query<{ id: string }>(`
      SELECT id
      FROM assignment_recipients
      WHERE assignment_id = '${draft.id}';
    `);
    const itemRows = await client.query<{
      id: string;
      workout_snapshot_id: string;
    }>(`
      SELECT
        assignment_workout_item_snapshots.id,
        assignment_workout_block_snapshots.workout_snapshot_id
      FROM assignment_workout_item_snapshots
      INNER JOIN assignment_workout_block_snapshots
        ON assignment_workout_block_snapshots.id = assignment_workout_item_snapshots.block_snapshot_id
      WHERE assignment_workout_item_snapshots.assignment_id = '${draft.id}'
      ORDER BY assignment_workout_item_snapshots.position
      LIMIT 1;
    `);
    const recipientId = recipientRows.rows[0]?.id;
    const itemSnapshotId = itemRows.rows[0]?.id;
    const workoutSnapshotId = itemRows.rows[0]?.workout_snapshot_id;
    expect(recipientId).toBeDefined();
    expect(itemSnapshotId).toBeDefined();
    expect(workoutSnapshotId).toBeDefined();

    await saveAthletePrescriptionOverride(
      createAthletePrescriptionUnitOfWork(database),
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        actorUserId: "00000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        recipientId: recipientId!,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        itemSnapshotId: itemSnapshotId!,
        planSlotSnapshotId: null,
        expectedVersion: null,
        overriddenFields: ["reps"],
        reps: 20,
        load: null,
        loadValue: null,
        loadUnit: null,
        normalizedLoadKg: null,
        durationSeconds: null,
        distanceMeters: null,
        restSeconds: null,
        tempo: null,
        notes: null,
        reason: "Individual progression",
      },
    );

    const futureEffectiveItems =
      await listEffectiveWorkoutItemsForAthleteOccurrence(database, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        workoutSnapshotId: workoutSnapshotId!,
        planSlotSnapshotId: null,
        sessionId: null,
      });
    expect(futureEffectiveItems).toEqual([
      expect.objectContaining({ id: itemSnapshotId, reps: 20 }),
    ]);

    const started = await startAssignmentSession(
      createAssignmentSessionUnitOfWork(database),
      {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        now: new Date("2026-08-12T12:00:00.000Z"),
      },
    );
    const prescriptions = await client.query<{
      reps: number | null;
      source_override_id: string | null;
    }>(`
      SELECT reps, source_override_id
      FROM assignment_session_effective_item_prescriptions
      WHERE session_id = '${started.id}';
    `);
    const sharedItems = await client.query<{ reps: number | null }>(`
      SELECT reps
      FROM assignment_workout_item_snapshots
      WHERE id = '${itemSnapshotId}';
    `);

    expect(prescriptions.rows).toEqual([
      expect.objectContaining({
        reps: 20,
        source_override_id: expect.any(String),
      }),
    ]);
    expect(sharedItems.rows).toEqual([{ reps: 5 }]);

    const startedEffectiveItems =
      await listEffectiveWorkoutItemsForAthleteOccurrence(database, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        assignmentId: draft.id,
        athleteUserId: "00000000-0000-4000-8000-000000000002",
        workoutSnapshotId: workoutSnapshotId!,
        planSlotSnapshotId: null,
        sessionId: started.id,
      });
    expect(startedEffectiveItems).toEqual([
      expect.objectContaining({ id: itemSnapshotId, reps: 20 }),
    ]);

    await expect(
      saveAthletePrescriptionOverride(
        createAthletePrescriptionUnitOfWork(database),
        {
          organizationId: "10000000-0000-4000-8000-000000000001",
          actorUserId: "00000000-0000-4000-8000-000000000001",
          assignmentId: draft.id,
          recipientId: recipientId!,
          athleteUserId: "00000000-0000-4000-8000-000000000002",
          itemSnapshotId: itemSnapshotId!,
          planSlotSnapshotId: null,
          expectedVersion: 1,
          overriddenFields: ["reps"],
          reps: 25,
          load: null,
          loadValue: null,
          loadUnit: null,
          normalizedLoadKg: null,
          durationSeconds: null,
          distanceMeters: null,
          restSeconds: null,
          tempo: null,
          notes: null,
          reason: "Later progression",
        },
      ),
    ).rejects.toThrow("Started or completed sessions");

    const immutablePrescriptionRows = await client.query<{
      reps: number | null;
    }>(`
      SELECT reps
      FROM assignment_session_effective_item_prescriptions
      WHERE session_id = '${started.id}';
    `);
    expect(immutablePrescriptionRows.rows).toEqual([{ reps: 20 }]);
  });
});
