import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationsRootPath = resolve(process.cwd(), "drizzle");
const migrationName = "20260812173801_timeliness-policy";

async function applyMigration(database: PGlite, directory: string) {
  const migration = await readFile(
    resolve(migrationsRootPath, directory, "migration.sql"),
    "utf8",
  );

  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await database.exec(statement);
  }
}

describe("timeliness policy migration", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await database.waitReady;
    const directories = (
      await readdir(migrationsRootPath, { withFileTypes: true })
    )
      .filter((entry) => entry.isDirectory() && entry.name !== migrationName)
      .map((entry) => entry.name)
      .sort();

    for (const directory of directories) {
      await applyMigration(database, directory);
    }

    await database.exec(`
      INSERT INTO users (id, clerk_user_id, email)
      VALUES ('00000000-0000-4000-8000-000000000001', 'athlete', 'athlete@example.com');

      INSERT INTO organizations (id, name, timezone)
      VALUES ('10000000-0000-4000-8000-000000000001', 'North High', 'UTC');

      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES (
        '10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
        'athlete'
      );

      INSERT INTO workouts (id, organization_id, name)
      VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Strength');

      INSERT INTO plans (id, organization_id, name)
      VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Weekly Plan');

      INSERT INTO assignments (
        id, organization_id, source_workout_id, timezone, scheduled_date
      ) VALUES
        (
          '40000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          'UTC',
          '2099-01-01'
        ),
        (
          '40000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          'UTC',
          '2000-01-01'
        );

      INSERT INTO assignments (
        id, organization_id, source_plan_id, timezone, start_date, end_date
      ) VALUES (
        '40000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'UTC',
        '2099-01-01',
        '2099-01-31'
      );

      INSERT INTO assignment_recipients (
        id, organization_id, assignment_id, athlete_user_id
      ) VALUES
        ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
        ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'),
        ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001');

      INSERT INTO assignment_workout_snapshots (
        id, organization_id, assignment_id, name, position
      ) VALUES
        ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Future Strength', 0),
        ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Legacy Strength', 0),
        ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'Weekly Strength', 0);

      INSERT INTO assignment_plan_slot_snapshots (
        id, organization_id, assignment_id, workout_snapshot_id,
        schedule_type, target_sessions_per_week, position
      ) VALUES (
        '70000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000003',
        '60000000-0000-4000-8000-000000000003',
        'weekly_frequency',
        1,
        0
      );

      INSERT INTO assignment_sessions (
        id, organization_id, assignment_id, recipient_id, athlete_user_id,
        workout_snapshot_id, plan_slot_snapshot_id, scheduled_date,
        available_from, available_until
      ) VALUES
        (
          '80000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000001',
          '50000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000001',
          NULL,
          '2099-01-01',
          '2099-01-01T00:00:00Z',
          '2099-01-02T00:00:00Z'
        ),
        (
          '80000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000002',
          '50000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000002',
          NULL,
          '2000-01-01',
          '2000-01-01T00:00:00Z',
          '2000-01-02T00:00:00Z'
        ),
        (
          '80000000-0000-4000-8000-000000000003',
          '10000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000003',
          '50000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000003',
          '70000000-0000-4000-8000-000000000001',
          '2099-01-07',
          '2099-01-07T00:00:00Z',
          '2099-01-08T00:00:00Z'
        );
    `);
  });

  afterEach(async () => {
    await database.close();
  });

  it("backfills policy-eligible fixed and weekly deadlines without classifying legacy sessions", async () => {
    await applyMigration(database, migrationName);

    const result = await database.query<{
      id: string;
      due_at: string | null;
    }>(`
      SELECT id, (due_at AT TIME ZONE 'UTC')::text AS due_at
      FROM assignment_sessions
      ORDER BY id;
    `);

    expect(result.rows).toEqual([
      {
        id: "80000000-0000-4000-8000-000000000001",
        due_at: "2099-01-02 00:00:00",
      },
      {
        id: "80000000-0000-4000-8000-000000000002",
        due_at: null,
      },
      {
        id: "80000000-0000-4000-8000-000000000003",
        due_at: "2099-01-12 00:00:00",
      },
    ]);
  });

  it("adds constrained policy defaults and the organization deadline index", async () => {
    await applyMigration(database, migrationName);

    const assignments = await database.query<{
      timeliness_policy_version: number;
      fixed_due_local_minute: number;
      weekly_due_day: number;
      weekly_due_local_minute: number;
      late_entry_days: number;
    }>(`
      SELECT
        timeliness_policy_version,
        fixed_due_local_minute,
        weekly_due_day,
        weekly_due_local_minute,
        late_entry_days
      FROM assignments
      LIMIT 1;
    `);
    const indexes = await database.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE indexname = 'assignment_sessions_organization_due_at_idx';
    `);

    expect(assignments.rows[0]).toEqual({
      timeliness_policy_version: 1,
      fixed_due_local_minute: 1440,
      weekly_due_day: 7,
      weekly_due_local_minute: 1440,
      late_entry_days: 7,
    });
    expect(indexes.rows).toHaveLength(1);
    await expect(
      database.exec(`
        UPDATE assignments
        SET timeliness_policy_version = 2
        WHERE id = '40000000-0000-4000-8000-000000000001';
      `),
    ).rejects.toThrow(/assignments_timeliness_policy_version_supported/);
  });
});
