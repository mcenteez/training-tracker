import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/client";
import {
  createAssignment,
  publishAssignment,
} from "@/modules/assignments/application/assignment-service";
import { listAssignmentsForOrganization } from "@/modules/assignments/db/queries";
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
});
