import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/client";
import {
  acceptTeamInvitation,
  createTeamInvitation,
} from "@/modules/teams/application/team-invitation-service";
import {
  addOrUpdateTeamMember,
  removeTeamMember,
  updateTeam,
} from "@/modules/teams/application/team-service";
import { createTeamInvitationUnitOfWork } from "@/modules/teams/db/team-invitation-unit-of-work";
import { createTeamUnitOfWork } from "@/modules/teams/db/unit-of-work";

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

const ids = {
  manager: "00000000-0000-4000-8000-000000000001",
  newAthlete: "00000000-0000-4000-8000-000000000002",
  viewer: "00000000-0000-4000-8000-000000000003",
  organization: "10000000-0000-4000-8000-000000000001",
  team: "80000000-0000-4000-8000-000000000001",
};

describe("team invitation unit of work", () => {
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
        ('${ids.manager}', 'manager', 'manager@example.com'),
        ('${ids.newAthlete}', 'new-athlete', 'new@example.com'),
        ('${ids.viewer}', 'viewer', 'viewer@example.com');

      INSERT INTO organizations (id, name, timezone)
      VALUES ('${ids.organization}', 'North High', 'UTC');

      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES
        ('${ids.organization}', '${ids.manager}', 'manager'),
        ('${ids.organization}', '${ids.viewer}', 'viewer');

      INSERT INTO teams (id, organization_id, name)
      VALUES ('${ids.team}', '${ids.organization}', 'Varsity');

      INSERT INTO team_memberships (organization_id, team_id, user_id, role)
      VALUES ('${ids.organization}', '${ids.team}', '${ids.manager}', 'manager');
    `);
  });

  afterEach(async () => {
    await client.close();
  });

  it("accepts invitations transactionally with minimum organization access", async () => {
    const unitOfWork = createTeamInvitationUnitOfWork(database);
    const now = new Date("2026-08-12T12:00:00.000Z");

    await createTeamInvitation(unitOfWork, {
      organizationId: ids.organization,
      teamId: ids.team,
      actorUserId: ids.manager,
      invitedEmail: "new@example.com",
      role: "athlete",
      token: "new-athlete-token",
      expiresAt: new Date("2026-08-19T12:00:00.000Z"),
      now,
    });
    await acceptTeamInvitation(unitOfWork, {
      actorUserId: ids.newAthlete,
      actorEmail: "new@example.com",
      token: "new-athlete-token",
      now,
    });

    await createTeamInvitation(unitOfWork, {
      organizationId: ids.organization,
      teamId: ids.team,
      actorUserId: ids.manager,
      invitedEmail: "viewer@example.com",
      role: "manager",
      token: "viewer-token",
      expiresAt: new Date("2026-08-19T12:00:00.000Z"),
      now,
    });
    await acceptTeamInvitation(unitOfWork, {
      actorUserId: ids.viewer,
      actorEmail: "viewer@example.com",
      token: "viewer-token",
      now,
    });

    const memberships = await client.query<{
      user_id: string;
      organization_role: string;
      team_role: string;
    }>(`
      SELECT
        om.user_id,
        om.role::text AS organization_role,
        tm.role::text AS team_role
      FROM organization_memberships om
      JOIN team_memberships tm
        ON tm.organization_id = om.organization_id
        AND tm.user_id = om.user_id
      WHERE om.organization_id = '${ids.organization}'
        AND om.user_id IN ('${ids.newAthlete}', '${ids.viewer}')
      ORDER BY om.user_id;
    `);

    expect(memberships.rows).toEqual([
      {
        user_id: ids.newAthlete,
        organization_role: "athlete",
        team_role: "athlete",
      },
      {
        user_id: ids.viewer,
        organization_role: "viewer",
        team_role: "manager",
      },
    ]);

    const lifecycle = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM team_invitations
      WHERE status = 'accepted' AND accepted_by_user_id IS NOT NULL;
    `);
    expect(lifecycle.rows[0]?.count).toBe(2);

    const auditEvents = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM organization_audit_events
      WHERE action IN ('team.invite.created', 'team.invite.accepted');
    `);
    expect(auditEvents.rows[0]?.count).toBe(4);
  });

  it("records sanitized team settings and roster events transactionally", async () => {
    const unitOfWork = createTeamUnitOfWork(database);

    await updateTeam(unitOfWork, {
      organizationId: ids.organization,
      teamId: ids.team,
      actorUserId: ids.manager,
      name: "Varsity Strength",
    });
    await addOrUpdateTeamMember(unitOfWork, {
      organizationId: ids.organization,
      teamId: ids.team,
      actorUserId: ids.manager,
      targetUserId: ids.viewer,
      role: "viewer",
    });
    await removeTeamMember(unitOfWork, {
      organizationId: ids.organization,
      teamId: ids.team,
      actorUserId: ids.manager,
      targetUserId: ids.viewer,
    });

    const auditEvents = await client.query<{
      action: string;
      target_user_id: string | null;
      details: Record<string, string>;
    }>(`
      SELECT action, target_user_id, details
      FROM organization_audit_events
      WHERE action IN (
        'team.updated',
        'team.member.upserted',
        'team.member.removed'
      )
      ORDER BY occurred_at, action;
    `);

    expect(auditEvents.rows).toHaveLength(3);
    expect(auditEvents.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "team.updated",
          target_user_id: null,
          details: { teamId: ids.team },
        }),
        expect.objectContaining({
          action: "team.member.upserted",
          target_user_id: ids.viewer,
          details: { teamId: ids.team, role: "viewer" },
        }),
        expect.objectContaining({
          action: "team.member.removed",
          target_user_id: ids.viewer,
          details: { teamId: ids.team },
        }),
      ]),
    );
    expect(JSON.stringify(auditEvents.rows)).not.toContain(
      "viewer@example.com",
    );
    expect(JSON.stringify(auditEvents.rows)).not.toContain("Varsity Strength");
  });
});
