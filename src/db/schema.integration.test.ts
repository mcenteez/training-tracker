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
