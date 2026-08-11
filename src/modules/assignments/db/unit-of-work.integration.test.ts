import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/client";
import {
  cancelAssignment,
  createAssignment,
  publishAssignment,
} from "@/modules/assignments/application/assignment-service";
import {
  resetAssignmentSession,
  startAssignmentSession,
  autosaveAssignmentSessionResults,
} from "@/modules/assignments/application/assignment-session-service";
import {
  findPublishedAssignmentForAthlete,
  listAssignmentsForOrganization,
  listPlanSlotSnapshotsForAthleteAssignment,
  listPublishedAssignmentsForAthlete,
} from "@/modules/assignments/db/queries";
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

    await publishAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: draft.version,
    });

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

    await publishAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: draft.version,
    });

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

    await publishAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: draft.version,
    });

    const slotRows = await client.query<{ id: string }>(`
      SELECT id FROM assignment_plan_slot_snapshots
      WHERE assignment_id = '${draft.id}';
    `);
    const slotId = slotRows.rows[0]!.id;
    const sessionUnitOfWork = createAssignmentSessionUnitOfWork(database);

    const first = await startAssignmentSession(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      planSlotSnapshotId: slotId,
      scheduledDate: "2026-08-10",
      now: new Date("2026-08-10T12:00:00.000Z"),
    });
    const second = await startAssignmentSession(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      planSlotSnapshotId: slotId,
      scheduledDate: "2026-08-12",
      now: new Date("2026-08-12T12:00:00.000Z"),
    });
    const firstAgain = await startAssignmentSession(sessionUnitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      athleteUserId: "00000000-0000-4000-8000-000000000002",
      planSlotSnapshotId: slotId,
      scheduledDate: "2026-08-10",
      now: new Date("2026-08-10T14:00:00.000Z"),
    });

    expect(first.id).not.toBe(second.id);
    expect(firstAgain.id).toBe(first.id);
    expect(first.planSlotSnapshotId).toBe(slotId);

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

    await publishAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: draft.version,
    });

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
      exercise_instructions: string;
    }>(`
      SELECT exercise_name, reps, load, exercise_instructions
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
        load: "75%",
        exercise_instructions: "Brace before descending",
      },
    ]);
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
    const published = await publishAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: draft.version,
    });

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
    await publishAssignment(unitOfWork, {
      organizationId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      assignmentId: draft.id,
      expectedVersion: draft.version,
    });

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
    }>(`
      SELECT status, version, started_at, submitted_at
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
      },
    ]);
    expect(resultRows.rows).toEqual([{ count: 0 }]);
  });
});
