import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/client";
import {
  findTeamAssignmentCompliance,
  listTeamAssignmentCompliance,
} from "./team-compliance-queries";

const migrationsRootPath = resolve(process.cwd(), "drizzle");

async function applyMigrations(database: PGlite) {
  const directories = (
    await readdir(migrationsRootPath, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const directory of directories) {
    const migration = await readFile(
      resolve(migrationsRootPath, directory, "migration.sql"),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.exec(statement);
    }
  }
}

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  otherOrganization: "10000000-0000-4000-8000-000000000002",
  team: "20000000-0000-4000-8000-000000000001",
  otherTeam: "20000000-0000-4000-8000-000000000002",
  athlete: "00000000-0000-4000-8000-000000000001",
  otherAthlete: "00000000-0000-4000-8000-000000000002",
  workout: "30000000-0000-4000-8000-000000000001",
  assignment: "40000000-0000-4000-8000-000000000001",
  recipient: "50000000-0000-4000-8000-000000000001",
  otherRecipient: "50000000-0000-4000-8000-000000000002",
  snapshot: "60000000-0000-4000-8000-000000000001",
  session: "70000000-0000-4000-8000-000000000001",
};

describe("team compliance queries", () => {
  let client: PGlite;
  let database: Database;

  beforeEach(async () => {
    client = new PGlite();
    await client.waitReady;
    await applyMigrations(client);
    database = drizzle({ client }) as unknown as Database;

    await client.exec(`
      INSERT INTO users (id, clerk_user_id, email, full_name)
      VALUES
        ('${ids.athlete}', 'athlete-1', 'athlete@example.com', 'Athlete One'),
        ('${ids.otherAthlete}', 'athlete-2', 'other@example.com', 'Athlete Two');

      INSERT INTO organizations (id, name, timezone)
      VALUES
        ('${ids.organization}', 'North High', 'UTC'),
        ('${ids.otherOrganization}', 'South High', 'UTC');

      INSERT INTO teams (id, organization_id, name)
      VALUES
        ('${ids.team}', '${ids.organization}', 'Varsity'),
        ('${ids.otherTeam}', '${ids.organization}', 'Junior Varsity');

      INSERT INTO workouts (id, organization_id, name)
      VALUES ('${ids.workout}', '${ids.organization}', 'Lower Strength');

      INSERT INTO assignments (
        id, organization_id, source_workout_id, timezone, scheduled_date,
        status, published_at
      ) VALUES (
        '${ids.assignment}', '${ids.organization}', '${ids.workout}', 'UTC',
        '2026-08-12', 'published', '2026-08-01T12:00:00Z'
      );

      INSERT INTO assignment_recipients (
        id, organization_id, assignment_id, athlete_user_id
      ) VALUES
        ('${ids.recipient}', '${ids.organization}', '${ids.assignment}', '${ids.athlete}'),
        ('${ids.otherRecipient}', '${ids.organization}', '${ids.assignment}', '${ids.otherAthlete}');

      INSERT INTO assignment_recipient_team_scopes (
        organization_id, assignment_id, recipient_id, team_id
      ) VALUES
        ('${ids.organization}', '${ids.assignment}', '${ids.recipient}', '${ids.team}'),
        ('${ids.organization}', '${ids.assignment}', '${ids.otherRecipient}', '${ids.otherTeam}');

      INSERT INTO assignment_workout_snapshots (
        id, organization_id, assignment_id, source_workout_id,
        source_workout_version, name, position
      ) VALUES (
        '${ids.snapshot}', '${ids.organization}', '${ids.assignment}',
        '${ids.workout}', 1, 'Lower Strength', 0
      );

      INSERT INTO assignment_sessions (
        id, organization_id, assignment_id, recipient_id, athlete_user_id,
        workout_snapshot_id, scheduled_date, available_from, available_until,
        status, started_at
      ) VALUES (
        '${ids.session}', '${ids.organization}', '${ids.assignment}',
        '${ids.recipient}', '${ids.athlete}', '${ids.snapshot}', '2026-08-12',
        '2026-08-12T00:00:00Z', '2026-08-13T00:00:00Z', 'in_progress',
        '2026-08-12T12:00:00Z'
      );
    `);
  });

  afterEach(async () => {
    await client.close();
  });

  it("returns only persisted recipients for the selected team", async () => {
    const assignments = await listTeamAssignmentCompliance(database, {
      organizationId: ids.organization,
      teamId: ids.team,
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.recipients).toHaveLength(1);
    expect(assignments[0]?.recipients[0]?.email).toBe("athlete@example.com");
    expect(assignments[0]?.counts.inProgress).toBe(1);
  });

  it("returns no detail for another team or organization", async () => {
    await expect(
      findTeamAssignmentCompliance(database, {
        organizationId: ids.organization,
        teamId: ids.otherTeam,
        assignmentId: ids.assignment,
        now: new Date("2026-08-12T16:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ recipientCount: 1 });

    await expect(
      findTeamAssignmentCompliance(database, {
        organizationId: ids.otherOrganization,
        teamId: ids.team,
        assignmentId: ids.assignment,
      }),
    ).resolves.toBeNull();
  });
});
