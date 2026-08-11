import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationsRootPath = resolve(process.cwd(), "drizzle");

async function applyMigrations(database: PGlite) {
  const migrationDirectories = (
    await readdir(migrationsRootPath, {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const directory of migrationDirectories) {
    const migrationPath = resolve(
      migrationsRootPath,
      directory,
      "migration.sql",
    );
    const migration = await readFile(migrationPath, "utf8");

    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        await database.exec(statement);
      }
    }
  }
}

async function seedUsersAndOrganizations(database: PGlite) {
  await database.exec(`
    INSERT INTO users (id, clerk_user_id, email)
    VALUES
      ('00000000-0000-0000-0000-000000000001', 'clerk_owner_1', 'owner1@example.com'),
      ('00000000-0000-0000-0000-000000000002', 'clerk_owner_2', 'owner2@example.com'),
      ('00000000-0000-0000-0000-000000000003', 'clerk_athlete_1', 'athlete@example.com');

    INSERT INTO organizations (id, name)
    VALUES
      ('10000000-0000-0000-0000-000000000001', 'North High'),
      ('10000000-0000-0000-0000-000000000002', 'South High');
  `);
}

describe("tenant schema", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await database.waitReady;
    await applyMigrations(database);
    await seedUsersAndOrganizations(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("allows only one Owner per organization", async () => {
    await database.exec(`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');
    `);

    await expect(
      database.exec(`
        INSERT INTO organization_memberships (organization_id, user_id, role)
        VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'owner');
      `),
    ).rejects.toThrow(/organization_memberships_single_owner_idx/);
  });

  it("defaults organization timezone to UTC", async () => {
    await database.exec(`
      INSERT INTO organizations (id, name)
      VALUES ('10000000-0000-0000-0000-000000000099', 'West High');
    `);

    const result = await database.query<{ timezone: string }>(`
      SELECT timezone
      FROM organizations
      WHERE id = '10000000-0000-0000-0000-000000000099';
    `);

    expect(result.rows[0]?.timezone).toBe("UTC");
  });

  it("rejects null organization timezone", async () => {
    await expect(
      database.exec(`
        INSERT INTO organizations (id, name, timezone)
        VALUES (
          '10000000-0000-0000-0000-000000000098',
          'East High',
          NULL
        );
      `),
    ).rejects.toThrow(/timezone/);
  });

  it("rejects a team membership using another organization's membership", async () => {
    await database.exec(`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'athlete');

      INSERT INTO teams (id, organization_id, name)
      VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Varsity');
    `);

    await expect(
      database.exec(`
        INSERT INTO team_memberships (organization_id, team_id, user_id, role)
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000003',
          'athlete'
        );
      `),
    ).rejects.toThrow(/team_memberships_organization_membership_fk/);
  });

  it("removes dependent team memberships with organization membership", async () => {
    await database.exec(`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'athlete');

      INSERT INTO teams (id, organization_id, name)
      VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Varsity');

      INSERT INTO team_memberships (organization_id, team_id, user_id, role)
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'athlete'
      );

      DELETE FROM organization_memberships
      WHERE organization_id = '10000000-0000-0000-0000-000000000001'
        AND user_id = '00000000-0000-0000-0000-000000000003';
    `);

    const result = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM team_memberships
      WHERE user_id = '00000000-0000-0000-0000-000000000003';
    `);

    expect(result.rows[0]?.count).toBe(0);
  });

  it("keeps organization membership when only team membership is removed", async () => {
    await database.exec(`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'athlete');

      INSERT INTO teams (id, organization_id, name)
      VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Varsity');

      INSERT INTO team_memberships (organization_id, team_id, user_id, role)
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'athlete'
      );

      DELETE FROM team_memberships
      WHERE team_id = '20000000-0000-0000-0000-000000000001'
        AND user_id = '00000000-0000-0000-0000-000000000003';
    `);

    const result = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM organization_memberships
      WHERE organization_id = '10000000-0000-0000-0000-000000000001'
        AND user_id = '00000000-0000-0000-0000-000000000003';
    `);

    expect(result.rows[0]?.count).toBe(1);
  });

  it("allows only one pending invitation per organization email", async () => {
    await database.exec(`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');

      INSERT INTO organization_invitations (
        organization_id,
        invited_email,
        role,
        token,
        expires_at,
        created_by_user_id
      )
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        'invitee@example.com',
        'viewer',
        'invite-token-1',
        now() + interval '7 days',
        '00000000-0000-0000-0000-000000000001'
      );
    `);

    await expect(
      database.exec(`
        INSERT INTO organization_invitations (
          organization_id,
          invited_email,
          role,
          token,
          expires_at,
          created_by_user_id
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          'invitee@example.com',
          'athlete',
          'invite-token-2',
          now() + interval '7 days',
          '00000000-0000-0000-0000-000000000001'
        );
      `),
    ).rejects.toThrow(/organization_invitations_pending_email_idx/);
  });

  it("permits reinviting the same email after invitation is revoked", async () => {
    await database.exec(`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');

      INSERT INTO organization_invitations (
        organization_id,
        invited_email,
        role,
        token,
        expires_at,
        created_by_user_id,
        status,
        revoked_at
      )
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        'invitee@example.com',
        'viewer',
        'invite-token-1',
        now() + interval '7 days',
        '00000000-0000-0000-0000-000000000001',
        'revoked',
        now()
      );

      INSERT INTO organization_invitations (
        organization_id,
        invited_email,
        role,
        token,
        expires_at,
        created_by_user_id
      )
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        'invitee@example.com',
        'athlete',
        'invite-token-2',
        now() + interval '7 days',
        '00000000-0000-0000-0000-000000000001'
      );
    `);

    const result = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM organization_invitations
      WHERE organization_id = '10000000-0000-0000-0000-000000000001'
        AND invited_email = 'invitee@example.com';
    `);

    expect(result.rows[0]?.count).toBe(2);
  });

  it("allows the same pending invite email across different organizations", async () => {
    await database.exec(`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');

      INSERT INTO organization_invitations (
        organization_id,
        invited_email,
        role,
        token,
        expires_at,
        created_by_user_id
      )
      VALUES
        (
          '10000000-0000-0000-0000-000000000001',
          'shared@example.com',
          'viewer',
          'org-1-invite',
          now() + interval '7 days',
          '00000000-0000-0000-0000-000000000001'
        ),
        (
          '10000000-0000-0000-0000-000000000002',
          'shared@example.com',
          'viewer',
          'org-2-invite',
          now() + interval '7 days',
          '00000000-0000-0000-0000-000000000002'
        );
    `);

    const result = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM organization_invitations
      WHERE invited_email = 'shared@example.com'
        AND status = 'pending';
    `);

    expect(result.rows[0]?.count).toBe(2);
  });

  it("keeps membership in another organization when one organization membership is removed", async () => {
    await database.exec(`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'athlete'),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'athlete');

      DELETE FROM organization_memberships
      WHERE organization_id = '10000000-0000-0000-0000-000000000001'
        AND user_id = '00000000-0000-0000-0000-000000000003';
    `);

    const result = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM organization_memberships
      WHERE user_id = '00000000-0000-0000-0000-000000000003';
    `);

    expect(result.rows[0]?.count).toBe(1);
  });

  it("rejects a workout item using an exercise from another organization", async () => {
    await database.exec(`
      INSERT INTO exercises (id, organization_id, name)
      VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Back Squat');

      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Lower Strength');

      INSERT INTO workout_blocks (id, organization_id, workout_id, position)
      VALUES (
        '50000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        0
      );
    `);

    await expect(
      database.exec(`
        INSERT INTO workout_items (
          organization_id,
          workout_id,
          block_id,
          exercise_id,
          position,
          reps
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          0,
          5
        );
      `),
    ).rejects.toThrow(/workout_items_exercise_fk/);
  });

  it("rejects negative workout prescription values", async () => {
    await database.exec(`
      INSERT INTO exercises (id, organization_id, name)
      VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Back Squat');

      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Lower Strength');

      INSERT INTO workout_blocks (id, organization_id, workout_id, position)
      VALUES (
        '50000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        0
      );
    `);

    await expect(
      database.exec(`
        INSERT INTO workout_items (
          organization_id,
          workout_id,
          block_id,
          exercise_id,
          position,
          rest_seconds
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          0,
          -1
        );
      `),
    ).rejects.toThrow(/workout_items_rest_nonnegative/);
  });

  it("allows archived exercise names to be reused while active names stay unique", async () => {
    await database.exec(`
      INSERT INTO exercises (organization_id, name, status, archived_at)
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        'Back Squat',
        'archived',
        now()
      );

      INSERT INTO exercises (organization_id, name)
      VALUES ('10000000-0000-0000-0000-000000000001', 'back squat');
    `);

    await expect(
      database.exec(`
        INSERT INTO exercises (organization_id, name)
        VALUES ('10000000-0000-0000-0000-000000000001', 'BACK SQUAT');
      `),
    ).rejects.toThrow(/exercises_active_name_unique/);
  });

  it("rejects a plan schedule slot using a workout from another organization", async () => {
    await database.exec(`
      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Org 2 Push');

      INSERT INTO plans (id, organization_id, name)
      VALUES ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Org 1 Weekly Plan');
    `);

    await expect(
      database.exec(`
        INSERT INTO plan_schedule_slots (
          organization_id,
          plan_id,
          workout_id,
          day_of_week,
          position,
          label
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          '60000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000002',
          'monday',
          0,
          'Primary session'
        );
      `),
    ).rejects.toThrow(/plan_schedule_slots_workout_fk/);
  });

  it("allows archived plan names to be reused while active names stay unique", async () => {
    await database.exec(`
      INSERT INTO plans (organization_id, name, status, archived_at)
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        'Fall Strength',
        'archived',
        now()
      );

      INSERT INTO plans (organization_id, name)
      VALUES ('10000000-0000-0000-0000-000000000001', 'fall strength');
    `);

    await expect(
      database.exec(`
        INSERT INTO plans (organization_id, name)
        VALUES ('10000000-0000-0000-0000-000000000001', 'FALL STRENGTH');
      `),
    ).rejects.toThrow(/plans_unarchived_name_unique/);
  });

  it("cascades plan deletion through schedule slots", async () => {
    await database.exec(`
      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Org 1 Push');

      INSERT INTO plans (id, organization_id, name)
      VALUES ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Org 1 Weekly Plan');

      INSERT INTO plan_schedule_slots (
        id,
        organization_id,
        plan_id,
        workout_id,
        day_of_week,
        position,
        label
      )
      VALUES (
        '70000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '60000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        'monday',
        0,
        'Primary session'
      );

      DELETE FROM plans
      WHERE id = '60000000-0000-0000-0000-000000000001';
    `);

    const result = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM plan_schedule_slots
      WHERE id = '70000000-0000-0000-0000-000000000001';
    `);

    expect(result.rows[0]?.count).toBe(0);
  });

  it("enforces assignment source shape and required dates", async () => {
    await database.exec(`
      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Org 1 Session');

      INSERT INTO plans (id, organization_id, name)
      VALUES ('60000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Org 1 Plan');
    `);

    await expect(
      database.exec(`
        INSERT INTO assignments (
          organization_id,
          timezone,
          source_workout_id,
          source_plan_id,
          scheduled_date
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          'UTC',
          '40000000-0000-0000-0000-000000000011',
          '60000000-0000-0000-0000-000000000011',
          '2026-09-01'
        );
      `),
    ).rejects.toThrow(/assignments_exactly_one_source/);

    await expect(
      database.exec(`
        INSERT INTO assignments (
          organization_id,
          timezone,
          source_plan_id,
          start_date,
          end_date,
          scheduled_date
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          'UTC',
          '60000000-0000-0000-0000-000000000011',
          '2026-09-01',
          '2026-09-10',
          '2026-09-01'
        );
      `),
    ).rejects.toThrow(/assignments_plan_source_dates/);
  });

  it("enforces assignment target type and target id shape", async () => {
    await database.exec(`
      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'Org 1 Session');

      INSERT INTO teams (id, organization_id, name)
      VALUES ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'Varsity');

      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'athlete');

      INSERT INTO assignments (
        id,
        organization_id,
        timezone,
        source_workout_id,
        scheduled_date
      )
      VALUES (
        '80000000-0000-0000-0000-000000000012',
        '10000000-0000-0000-0000-000000000001',
        'UTC',
        '40000000-0000-0000-0000-000000000012',
        '2026-09-02'
      );
    `);

    await expect(
      database.exec(`
        INSERT INTO assignment_targets (
          organization_id,
          assignment_id,
          target_type,
          team_id,
          athlete_user_id
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          '80000000-0000-0000-0000-000000000012',
          'team',
          '20000000-0000-0000-0000-000000000012',
          '00000000-0000-0000-0000-000000000003'
        );
      `),
    ).rejects.toThrow(/assignment_targets_exactly_one_target/);

    await expect(
      database.exec(`
        INSERT INTO assignment_targets (
          organization_id,
          assignment_id,
          target_type,
          athlete_user_id
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          '80000000-0000-0000-0000-000000000012',
          'team',
          '00000000-0000-0000-0000-000000000003'
        );
      `),
    ).rejects.toThrow(/assignment_targets_target_shape/);
  });

  it("keeps assignment snapshot links scoped to the same assignment", async () => {
    await database.exec(`
      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Org 1 Session');

      INSERT INTO assignments (id, organization_id, timezone, source_workout_id, scheduled_date)
      VALUES
        ('80000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'UTC', '40000000-0000-0000-0000-000000000013', '2026-09-03'),
        ('80000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'UTC', '40000000-0000-0000-0000-000000000013', '2026-09-04');

      INSERT INTO assignment_workout_snapshots (
        id,
        organization_id,
        assignment_id,
        source_workout_id,
        source_workout_version,
        name,
        position
      )
      VALUES (
        '90000000-0000-0000-0000-000000000013',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000013',
        '40000000-0000-0000-0000-000000000013',
        1,
        'Snapshot A',
        0
      );
    `);

    await expect(
      database.exec(`
        INSERT INTO assignment_plan_slot_snapshots (
          organization_id,
          assignment_id,
          workout_snapshot_id,
          day_of_week,
          position
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          '80000000-0000-0000-0000-000000000014',
          '90000000-0000-0000-0000-000000000013',
          'monday',
          0
        );
      `),
    ).rejects.toThrow(/assignment_plan_slot_snapshots_workout_snapshot_fk/);
  });

  it("enforces unique result rounds per session item", async () => {
    await database.exec(`
      INSERT INTO exercises (id, organization_id, name)
      VALUES ('30000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'Back Squat');

      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'Org 1 Session');

      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'athlete');

      INSERT INTO assignments (
        id,
        organization_id,
        timezone,
        source_workout_id,
        scheduled_date
      )
      VALUES (
        '80000000-0000-0000-0000-000000000015',
        '10000000-0000-0000-0000-000000000001',
        'UTC',
        '40000000-0000-0000-0000-000000000014',
        '2026-09-05'
      );

      INSERT INTO assignment_recipients (
        id,
        organization_id,
        assignment_id,
        athlete_user_id
      )
      VALUES (
        '81000000-0000-0000-0000-000000000015',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000015',
        '00000000-0000-0000-0000-000000000003'
      );

      INSERT INTO assignment_workout_snapshots (
        id,
        organization_id,
        assignment_id,
        source_workout_id,
        source_workout_version,
        name,
        position
      )
      VALUES (
        '90000000-0000-0000-0000-000000000015',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000015',
        '40000000-0000-0000-0000-000000000014',
        1,
        'Snapshot Session',
        0
      );

      INSERT INTO assignment_workout_block_snapshots (
        id,
        organization_id,
        assignment_id,
        workout_snapshot_id,
        type,
        rounds,
        position
      )
      VALUES (
        '91000000-0000-0000-0000-000000000015',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000015',
        '90000000-0000-0000-0000-000000000015',
        'straight',
        1,
        0
      );

      INSERT INTO assignment_workout_item_snapshots (
        id,
        organization_id,
        assignment_id,
        block_snapshot_id,
        source_exercise_id,
        exercise_name,
        position,
        reps
      )
      VALUES (
        '92000000-0000-0000-0000-000000000015',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000015',
        '91000000-0000-0000-0000-000000000015',
        '30000000-0000-0000-0000-000000000014',
        'Back Squat',
        0,
        5
      );

      INSERT INTO assignment_sessions (
        id,
        organization_id,
        assignment_id,
        recipient_id,
        athlete_user_id,
        workout_snapshot_id,
        scheduled_date,
        available_from,
        available_until
      )
      VALUES (
        '93000000-0000-0000-0000-000000000015',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000015',
        '81000000-0000-0000-0000-000000000015',
        '00000000-0000-0000-0000-000000000003',
        '90000000-0000-0000-0000-000000000015',
        '2026-09-05',
        '2026-09-05T00:00:00.000Z',
        '2026-09-05T23:59:59.999Z'
      );

      INSERT INTO assignment_session_item_results (
        organization_id,
        assignment_id,
        session_id,
        item_snapshot_id,
        round_number,
        reps
      )
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000015',
        '93000000-0000-0000-0000-000000000015',
        '92000000-0000-0000-0000-000000000015',
        1,
        5
      );
    `);

    await expect(
      database.exec(`
        INSERT INTO assignment_session_item_results (
          organization_id,
          assignment_id,
          session_id,
          item_snapshot_id,
          round_number,
          reps
        )
        VALUES (
          '10000000-0000-0000-0000-000000000001',
          '80000000-0000-0000-0000-000000000015',
          '93000000-0000-0000-0000-000000000015',
          '92000000-0000-0000-0000-000000000015',
          1,
          4
        );
      `),
    ).rejects.toThrow(/assignment_session_item_results_round_unique/);
  });

  it("cascades organization deletion through the workout graph", async () => {
    await database.exec(`
      INSERT INTO exercises (id, organization_id, name)
      VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Back Squat');

      INSERT INTO workouts (id, organization_id, name)
      VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Lower Strength');

      INSERT INTO workout_blocks (id, organization_id, workout_id, position)
      VALUES (
        '50000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        0
      );

      INSERT INTO workout_items (
        organization_id,
        workout_id,
        block_id,
        exercise_id,
        position,
        reps
      )
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001',
        0,
        5
      );

      DELETE FROM organizations
      WHERE id = '10000000-0000-0000-0000-000000000001';
    `);

    const result = await database.query<{ count: number }>(`
      SELECT (
        (SELECT count(*) FROM exercises) +
        (SELECT count(*) FROM workouts) +
        (SELECT count(*) FROM workout_blocks) +
        (SELECT count(*) FROM workout_items)
      )::int AS count;
    `);

    expect(result.rows[0]?.count).toBe(0);
  });
});
