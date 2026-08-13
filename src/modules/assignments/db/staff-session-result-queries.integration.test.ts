import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/client";
import { AuthorizationError } from "@/modules/access-control/errors";
import { appendSessionComment } from "@/modules/assignments/application/session-comment-service";
import { createSessionCommentUnitOfWork } from "@/modules/assignments/db/session-comment-unit-of-work";
import { findStaffSessionResultDetail } from "./staff-session-result-queries";
import {
  findAthleteSessionTrainingLoad,
  summarizeAthleteAssignmentTrainingLoad,
  summarizeOrganizationTrainingLoad,
  summarizeTeamTrainingLoad,
} from "./training-load-queries";

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
  team: "20000000-0000-4000-8000-000000000001",
  otherTeam: "20000000-0000-4000-8000-000000000002",
  manager: "00000000-0000-4000-8000-000000000001",
  viewer: "00000000-0000-4000-8000-000000000002",
  athlete: "00000000-0000-4000-8000-000000000003",
  workout: "30000000-0000-4000-8000-000000000001",
  assignment: "40000000-0000-4000-8000-000000000001",
  recipient: "50000000-0000-4000-8000-000000000001",
  workoutSnapshot: "60000000-0000-4000-8000-000000000001",
  blockSnapshot: "61000000-0000-4000-8000-000000000001",
  firstItem: "62000000-0000-4000-8000-000000000001",
  secondItem: "62000000-0000-4000-8000-000000000002",
  session: "70000000-0000-4000-8000-000000000001",
};

describe("staff session result queries", () => {
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
        ('${ids.manager}', 'manager', 'manager@example.com', 'Coach Manager'),
        ('${ids.viewer}', 'viewer', 'viewer@example.com', 'Coach Viewer'),
        ('${ids.athlete}', 'athlete', 'athlete@example.com', 'Athlete One');
      INSERT INTO organizations (id, name, timezone)
      VALUES ('${ids.organization}', 'North High', 'UTC');
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES
        ('${ids.organization}', '${ids.manager}', 'athlete'),
        ('${ids.organization}', '${ids.viewer}', 'athlete'),
        ('${ids.organization}', '${ids.athlete}', 'athlete');
      INSERT INTO teams (id, organization_id, name)
      VALUES
        ('${ids.team}', '${ids.organization}', 'Varsity'),
        ('${ids.otherTeam}', '${ids.organization}', 'Junior Varsity');
      INSERT INTO team_memberships (organization_id, team_id, user_id, role)
      VALUES
        ('${ids.organization}', '${ids.team}', '${ids.manager}', 'manager'),
        ('${ids.organization}', '${ids.team}', '${ids.viewer}', 'viewer'),
        ('${ids.organization}', '${ids.team}', '${ids.athlete}', 'athlete');
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
      ) VALUES (
        '${ids.recipient}', '${ids.organization}', '${ids.assignment}', '${ids.athlete}'
      );
      INSERT INTO assignment_recipient_team_scopes (
        organization_id, assignment_id, recipient_id, team_id
      ) VALUES (
        '${ids.organization}', '${ids.assignment}', '${ids.recipient}', '${ids.team}'
      );
      INSERT INTO assignment_workout_snapshots (
        id, organization_id, assignment_id, source_workout_id,
        source_workout_version, name, position
      ) VALUES (
        '${ids.workoutSnapshot}', '${ids.organization}', '${ids.assignment}',
        '${ids.workout}', 1, 'Lower Strength', 0
      );
      INSERT INTO assignment_workout_block_snapshots (
        id, organization_id, assignment_id, workout_snapshot_id,
        type, label, rounds, position
      ) VALUES (
        '${ids.blockSnapshot}', '${ids.organization}', '${ids.assignment}',
        '${ids.workoutSnapshot}', 'straight', 'Main work', 2, 0
      );
      INSERT INTO assignment_workout_item_snapshots (
        id, organization_id, assignment_id, block_snapshot_id,
        exercise_name, position, reps, load, load_value, load_unit,
        normalized_load_kg
      ) VALUES
        ('${ids.firstItem}', '${ids.organization}', '${ids.assignment}', '${ids.blockSnapshot}', 'Back Squat', 0, 10, '60 kg', 60, 'kg', 60),
        ('${ids.secondItem}', '${ids.organization}', '${ids.assignment}', '${ids.blockSnapshot}', 'Romanian Deadlift', 1, 8, '50 kg', 50, 'kg', 50);
      INSERT INTO assignment_sessions (
        id, organization_id, assignment_id, recipient_id, athlete_user_id,
        workout_snapshot_id, scheduled_date, available_from, available_until,
        status, started_at, submitted_at, duration_minutes, session_rpe
      ) VALUES (
        '${ids.session}', '${ids.organization}', '${ids.assignment}',
        '${ids.recipient}', '${ids.athlete}', '${ids.workoutSnapshot}',
        '2026-08-12', '2026-08-12T00:00:00Z', '2026-08-13T00:00:00Z',
        'submitted', '2026-08-12T12:00:00Z', '2026-08-12T13:00:00Z', 45, 8
      );
      INSERT INTO assignment_session_effective_item_prescriptions (
        organization_id, assignment_id, session_id, item_snapshot_id,
        reps, load, load_value, load_unit, normalized_load_kg
      ) VALUES
        ('${ids.organization}', '${ids.assignment}', '${ids.session}', '${ids.firstItem}', 10, '60 kg', 60, 'kg', 60),
        ('${ids.organization}', '${ids.assignment}', '${ids.session}', '${ids.secondItem}', 8, '50 kg', 50, 'kg', 50);
      INSERT INTO assignment_session_item_results (
        organization_id, assignment_id, session_id, item_snapshot_id,
        round_number, reps, load, load_value, load_unit, normalized_load_kg
      ) VALUES
        ('${ids.organization}', '${ids.assignment}', '${ids.session}', '${ids.secondItem}', 1, 8, '50 kg', 50, 'kg', 50),
        ('${ids.organization}', '${ids.assignment}', '${ids.session}', '${ids.firstItem}', 2, 5, '60 kg', 60, 'kg', 60),
        ('${ids.organization}', '${ids.assignment}', '${ids.session}', '${ids.firstItem}', 1, 5, '60 kg', 60, 'kg', 60);
    `);
  });

  afterEach(async () => {
    await client.close();
  });

  it("returns submitted metrics in snapshot and round order", async () => {
    const detail = await findStaffSessionResultDetail(database, {
      organizationId: ids.organization,
      teamId: ids.team,
      assignmentId: ids.assignment,
      sessionId: ids.session,
    });

    expect(
      detail?.results.map((result) => [
        result.exerciseName,
        result.roundNumber,
      ]),
    ).toEqual([
      ["Back Squat", 1],
      ["Back Squat", 2],
      ["Romanian Deadlift", 1],
    ]);
    expect(detail).toMatchObject({
      durationMinutes: 45,
      sessionRpe: 8,
      trainingLoad: {
        internalLoad: {
          state: "internalLoadAvailable",
          internalLoad: 360,
        },
        externalWork: {
          state: "externalWorkComparable",
          prescribedVolumeKg: 1000,
          completedVolumeKg: 1000,
          completion: 1,
        },
      },
    });
    expect(detail?.results[0]).toMatchObject({
      loadValue: "60",
      loadUnit: "kg",
      normalizedLoadKg: "60",
    });
    await expect(
      findStaffSessionResultDetail(database, {
        organizationId: ids.organization,
        teamId: ids.otherTeam,
        assignmentId: ids.assignment,
        sessionId: ids.session,
      }),
    ).resolves.toBeNull();
  });

  it("appends comments for Managers but not Viewers", async () => {
    const unitOfWork = createSessionCommentUnitOfWork(database);
    await appendSessionComment(unitOfWork, {
      organizationId: ids.organization,
      teamId: ids.team,
      assignmentId: ids.assignment,
      sessionId: ids.session,
      actorUserId: ids.manager,
      body: "Good control through both rounds.",
    });

    await expect(
      appendSessionComment(unitOfWork, {
        organizationId: ids.organization,
        teamId: ids.team,
        assignmentId: ids.assignment,
        sessionId: ids.session,
        actorUserId: ids.viewer,
        body: "Should not save",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const detail = await findStaffSessionResultDetail(database, {
      organizationId: ids.organization,
      teamId: ids.team,
      assignmentId: ids.assignment,
      sessionId: ids.session,
    });
    expect(detail?.comments).toEqual([
      expect.objectContaining({
        authorName: "Coach Manager",
        body: "Good control through both rounds.",
      }),
    ]);
    const auditEvents = await client.query<{
      action: string;
      details: Record<string, string>;
    }>(`
      SELECT action, details
      FROM organization_audit_events
      WHERE action = 'assignment.session.comment.created';
    `);
    expect(auditEvents.rows).toEqual([
      expect.objectContaining({
        action: "assignment.session.comment.created",
        details: expect.objectContaining({
          teamId: ids.team,
          assignmentId: ids.assignment,
          sessionId: ids.session,
        }),
      }),
    ]);
    expect(JSON.stringify(auditEvents.rows)).not.toContain(
      "Good control through both rounds.",
    );
  });

  it("returns authorized staff detail for an in-progress session", async () => {
    await client.exec(`
      UPDATE assignment_sessions
      SET status = 'in_progress', submitted_at = NULL
      WHERE id = '${ids.session}';
    `);
    await expect(
      findStaffSessionResultDetail(database, {
        organizationId: ids.organization,
        teamId: ids.team,
        assignmentId: ids.assignment,
        sessionId: ids.session,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: ids.session,
        status: "in_progress",
        submittedAt: null,
      }),
    );
  });

  it("reconciles athlete, team, and organization load summaries from authorized raw facts", async () => {
    const secondSession = "70000000-0000-4000-8000-000000000002";
    const directAthlete = "00000000-0000-4000-8000-000000000004";
    const directRecipient = "50000000-0000-4000-8000-000000000002";
    const directSession = "70000000-0000-4000-8000-000000000003";
    await client.exec(`
      INSERT INTO users (id, clerk_user_id, email, full_name)
      VALUES ('${directAthlete}', 'direct-athlete', 'direct@example.com', 'Direct Athlete');
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES ('${ids.organization}', '${directAthlete}', 'athlete');
      INSERT INTO assignment_recipients (
        id, organization_id, assignment_id, athlete_user_id
      ) VALUES (
        '${directRecipient}', '${ids.organization}', '${ids.assignment}', '${directAthlete}'
      );
      INSERT INTO assignment_sessions (
        id, organization_id, assignment_id, recipient_id, athlete_user_id,
        workout_snapshot_id, scheduled_date, available_from, available_until,
        status, started_at, submitted_at, duration_minutes, session_rpe
      ) VALUES
        ('${secondSession}', '${ids.organization}', '${ids.assignment}',
         '${ids.recipient}', '${ids.athlete}', '${ids.workoutSnapshot}',
         '2026-08-11', '2026-08-11T00:00:00Z', '2026-08-12T00:00:00Z',
         'submitted', '2026-08-11T12:00:00Z', '2026-08-11T13:00:00Z', NULL, 8),
        ('${directSession}', '${ids.organization}', '${ids.assignment}',
         '${directRecipient}', '${directAthlete}', '${ids.workoutSnapshot}',
         '2026-08-12', '2026-08-12T00:00:00Z', '2026-08-13T00:00:00Z',
         'submitted', '2026-08-12T14:00:00Z', '2026-08-12T15:00:00Z', 30, 5);
      INSERT INTO assignment_session_effective_item_prescriptions (
        organization_id, assignment_id, session_id, item_snapshot_id,
        reps, load, load_value, load_unit, normalized_load_kg
      ) VALUES
        ('${ids.organization}', '${ids.assignment}', '${secondSession}', '${ids.firstItem}', 10, '60 kg', 60, 'kg', 60),
        ('${ids.organization}', '${ids.assignment}', '${secondSession}', '${ids.secondItem}', 8, '50 kg', 50, 'kg', 50),
        ('${ids.organization}', '${ids.assignment}', '${directSession}', '${ids.firstItem}', 10, 'bodyweight', NULL, NULL, NULL);
      INSERT INTO assignment_session_item_results (
        organization_id, assignment_id, session_id, item_snapshot_id,
        round_number, reps, load, load_value, load_unit, normalized_load_kg
      ) VALUES
        ('${ids.organization}', '${ids.assignment}', '${secondSession}', '${ids.firstItem}', 1, 10, '60 kg', 60, 'kg', 60),
        ('${ids.organization}', '${ids.assignment}', '${secondSession}', '${ids.secondItem}', 1, 8, 'band', NULL, NULL, NULL),
        ('${ids.organization}', '${ids.assignment}', '${directSession}', '${ids.firstItem}', 1, 10, 'bodyweight', NULL, NULL, NULL);
    `);
    const asOf = new Date("2026-08-13T12:00:00.000Z");

    const [
      team,
      organization,
      teamAthlete,
      directAthleteSummary,
      directDetail,
    ] = await Promise.all([
      summarizeTeamTrainingLoad(database, {
        organizationId: ids.organization,
        teamId: ids.team,
        asOf,
        windowDays: 30,
      }),
      summarizeOrganizationTrainingLoad(database, {
        organizationId: ids.organization,
        asOf,
        windowDays: 30,
      }),
      summarizeAthleteAssignmentTrainingLoad(database, {
        organizationId: ids.organization,
        athleteUserId: ids.athlete,
        assignmentId: ids.assignment,
        asOf,
        windowDays: 30,
      }),
      summarizeAthleteAssignmentTrainingLoad(database, {
        organizationId: ids.organization,
        athleteUserId: directAthlete,
        assignmentId: ids.assignment,
        asOf,
        windowDays: 30,
      }),
      findAthleteSessionTrainingLoad(database, {
        organizationId: ids.organization,
        athleteUserId: directAthlete,
        assignmentId: ids.assignment,
        sessionId: directSession,
        asOf,
      }),
    ]);

    expect(team).toEqual({
      sessionCount: 2,
      athleteCount: 1,
      internalLoadAvailableCount: 1,
      notCapturedCount: 1,
      externalWorkComparableCount: 1,
      externalWorkPartialCount: 1,
      externalWorkUnavailableCount: 0,
      insufficientHistoryCount: 1,
      totalDurationMinutes: 45,
      totalInternalLoad: 360,
      totalPrescribedVolumeKg: 2000,
      totalCompletedVolumeKg: 1600,
    });
    expect(organization).toEqual({
      ...team,
      sessionCount: 3,
      athleteCount: 2,
      internalLoadAvailableCount: 2,
      externalWorkUnavailableCount: 1,
      insufficientHistoryCount: 2,
      totalDurationMinutes: 75,
      totalInternalLoad: 510,
    });
    expect(organization.totalInternalLoad).toBe(
      teamAthlete.totalInternalLoad + directAthleteSummary.totalInternalLoad,
    );
    expect(organization.totalCompletedVolumeKg).toBe(
      teamAthlete.totalCompletedVolumeKg +
        directAthleteSummary.totalCompletedVolumeKg,
    );
    expect(directDetail).toMatchObject({
      internalLoad: { internalLoad: 150 },
      externalWork: {
        state: "externalWorkUnavailable",
        completedVolumeKg: null,
      },
    });

    await client.exec(`
      DELETE FROM team_memberships
      WHERE organization_id = '${ids.organization}'
        AND team_id = '${ids.team}'
        AND user_id = '${ids.athlete}';
    `);
    await expect(
      summarizeTeamTrainingLoad(database, {
        organizationId: ids.organization,
        teamId: ids.team,
        asOf,
        windowDays: 30,
      }),
    ).resolves.toEqual(team);
    await expect(
      summarizeTeamTrainingLoad(database, {
        organizationId: ids.organization,
        teamId: ids.otherTeam,
        asOf,
        windowDays: 30,
      }),
    ).resolves.toMatchObject({ sessionCount: 0, totalInternalLoad: 0 });
    await expect(
      summarizeOrganizationTrainingLoad(database, {
        organizationId: "10000000-0000-4000-8000-000000000099",
        asOf,
        windowDays: 30,
      }),
    ).resolves.toMatchObject({ sessionCount: 0, totalInternalLoad: 0 });
  });
});
