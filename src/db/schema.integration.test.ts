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
});
