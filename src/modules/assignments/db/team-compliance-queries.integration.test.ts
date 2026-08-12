import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/client";
import {
  findTeamAssignmentCompliance,
  getTeamComplianceDashboard,
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
  emptyTeam: "20000000-0000-4000-8000-000000000003",
  athlete: "00000000-0000-4000-8000-000000000001",
  otherAthlete: "00000000-0000-4000-8000-000000000002",
  workout: "30000000-0000-4000-8000-000000000001",
  assignment: "40000000-0000-4000-8000-000000000001",
  pastAssignment: "40000000-0000-4000-8000-000000000002",
  olderAssignment: "40000000-0000-4000-8000-000000000003",
  recipient: "50000000-0000-4000-8000-000000000001",
  otherRecipient: "50000000-0000-4000-8000-000000000002",
  pastRecipient: "50000000-0000-4000-8000-000000000003",
  olderRecipient: "50000000-0000-4000-8000-000000000004",
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

      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES
        ('${ids.organization}', '${ids.athlete}', 'athlete'),
        ('${ids.organization}', '${ids.otherAthlete}', 'athlete');

      INSERT INTO teams (id, organization_id, name)
      VALUES
        ('${ids.team}', '${ids.organization}', 'Varsity'),
        ('${ids.otherTeam}', '${ids.organization}', 'Junior Varsity'),
        ('${ids.emptyTeam}', '${ids.organization}', 'Freshman');

      INSERT INTO team_memberships (organization_id, team_id, user_id, role)
      VALUES
        ('${ids.organization}', '${ids.team}', '${ids.athlete}', 'athlete'),
        ('${ids.organization}', '${ids.otherTeam}', '${ids.otherAthlete}', 'athlete');

      INSERT INTO workouts (id, organization_id, name)
      VALUES ('${ids.workout}', '${ids.organization}', 'Lower Strength');

      INSERT INTO assignments (
        id, organization_id, source_workout_id, timezone, scheduled_date,
        status, published_at
      ) VALUES
        (
          '${ids.assignment}', '${ids.organization}', '${ids.workout}', 'UTC',
          '2026-08-12', 'published', '2026-08-01T12:00:00Z'
        ),
        (
          '${ids.pastAssignment}', '${ids.organization}', '${ids.workout}', 'UTC',
          '2026-06-02', 'published', '2026-06-01T12:00:00Z'
        ),
        (
          '${ids.olderAssignment}', '${ids.organization}', '${ids.workout}', 'UTC',
          '2026-06-01', 'published', '2026-05-31T12:00:00Z'
        );

      INSERT INTO assignment_recipients (
        id, organization_id, assignment_id, athlete_user_id
      ) VALUES
        ('${ids.recipient}', '${ids.organization}', '${ids.assignment}', '${ids.athlete}'),
        ('${ids.otherRecipient}', '${ids.organization}', '${ids.assignment}', '${ids.otherAthlete}'),
        ('${ids.pastRecipient}', '${ids.organization}', '${ids.pastAssignment}', '${ids.athlete}'),
        ('${ids.olderRecipient}', '${ids.organization}', '${ids.olderAssignment}', '${ids.athlete}');

      INSERT INTO assignment_recipient_team_scopes (
        organization_id, assignment_id, recipient_id, team_id
      ) VALUES
        ('${ids.organization}', '${ids.assignment}', '${ids.recipient}', '${ids.team}'),
        ('${ids.organization}', '${ids.assignment}', '${ids.otherRecipient}', '${ids.otherTeam}'),
        ('${ids.organization}', '${ids.pastAssignment}', '${ids.pastRecipient}', '${ids.team}'),
        ('${ids.organization}', '${ids.olderAssignment}', '${ids.olderRecipient}', '${ids.team}');

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
      windowDays: 30,
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    const current = assignments.find(
      (assignment) => assignment.id === ids.assignment,
    );
    expect(assignments).toHaveLength(1);
    expect(current?.recipients).toHaveLength(1);
    expect(current?.recipients[0]?.email).toBe("athlete@example.com");
    expect(current?.counts.inProgress).toBe(1);
    expect(current?.summary.counts.started).toBe(1);
  });

  it("returns reconciled team totals, attention, coverage, and oldest overdue date", async () => {
    const dashboard = await getTeamComplianceDashboard(database, {
      organizationId: ids.organization,
      teamId: ids.team,
      windowDays: null,
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    expect(dashboard.assignments).toHaveLength(3);
    expect(dashboard.assignments[0]?.summary.counts.overdue).toBeGreaterThan(0);
    expect(dashboard.assignments.at(-1)?.id).toBe(ids.assignment);
    expect(dashboard.summary.counts).toEqual({
      completed: 0,
      overdue: 2,
      started: 1,
      dueToday: 0,
      upcoming: 0,
    });
    expect(dashboard.summary.eligibleDue).toBe(3);
    expect(dashboard.summary.athletesNeedingAttention).toBe(1);
    expect(dashboard.summary.oldestOverdueDate).toBe("2026-06-01");
    expect(dashboard.summary.athleteCoverage).toBe(1);
    expect(
      dashboard.assignments.reduce(
        (total, assignment) => total + assignment.summary.eligibleDue,
        0,
      ),
    ).toBe(dashboard.summary.eligibleDue);
  });

  it("applies time windows consistently", async () => {
    const now = new Date("2026-08-12T16:00:00.000Z");
    const thirtyDays = await getTeamComplianceDashboard(database, {
      organizationId: ids.organization,
      teamId: ids.team,
      windowDays: 30,
      now,
    });
    const ninetyDays = await getTeamComplianceDashboard(database, {
      organizationId: ids.organization,
      teamId: ids.team,
      windowDays: 90,
      now,
    });

    expect(thirtyDays.summary.eligibleDue).toBe(1);
    expect(thirtyDays.summary.athletesNeedingAttention).toBe(0);
    expect(ninetyDays.summary.eligibleDue).toBe(3);
    expect(ninetyDays.summary.athletesNeedingAttention).toBe(1);
  });

  it("preserves publish-time compliance after roster removal", async () => {
    await client.exec(`
      DELETE FROM team_memberships
      WHERE team_id = '${ids.team}' AND user_id = '${ids.athlete}';
    `);

    const dashboard = await getTeamComplianceDashboard(database, {
      organizationId: ids.organization,
      teamId: ids.team,
      windowDays: null,
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    expect(dashboard.summary.eligibleDue).toBe(3);
    expect(dashboard.rosteredAthleteIds).toEqual([]);
    expect(dashboard.summary.athleteCoverage).toBeNull();
  });

  it("handles canceled history and teams without assignments", async () => {
    await client.exec(`
      UPDATE assignments
      SET status = 'canceled', canceled_at = '2026-06-02T12:00:00Z'
      WHERE id = '${ids.pastAssignment}';
    `);

    const canceled = await getTeamComplianceDashboard(database, {
      organizationId: ids.organization,
      teamId: ids.team,
      windowDays: null,
      now: new Date("2026-08-12T16:00:00.000Z"),
    });
    const empty = await getTeamComplianceDashboard(database, {
      organizationId: ids.organization,
      teamId: ids.emptyTeam,
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    expect(canceled.summary.counts.overdue).toBe(2);
    expect(empty.assignments).toEqual([]);
    expect(empty.summary.completionRate).toBeNull();
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
