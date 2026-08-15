import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  assignmentAthleteItemOverrides,
  assignmentPlanSlotSnapshots,
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentTargets,
  assignmentWorkoutBlockSnapshots,
  assignmentWorkoutItemSnapshots,
  assignmentWorkoutSnapshots,
} from "@/modules/assignments/db/schema";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { teams } from "@/modules/teams/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";
import { users } from "@/modules/users/db/schema";
import {
  adaptResistance,
  resistanceFromPersistence,
  type Resistance,
} from "@/modules/resistance/application/resistance";

export interface AssignmentPrescriptionRecipient {
  recipientId: string;
  athleteUserId: string;
  fullName: string | null;
  email: string;
  teamIds: string[];
  teamNames: string[];
  isDirectTarget: boolean;
}

export interface PreparedRecipientRosterChanges {
  addedAthleteUserIds: string[];
  removedAthleteUserIds: string[];
  ineligibleAthleteUserIds: string[];
}

export interface TeamAthletePrescriptionItem {
  recipientId: string;
  athleteUserId: string;
  itemSnapshotId: string;
  workoutSnapshotId: string;
  workoutName: string;
  sourceWorkoutVersion: number | null;
  planSlotSnapshotId: string | null;
  planSlotLabel: string | null;
  scheduleType: "fixed_day" | "weekly_frequency" | null;
  exerciseName: string;
  reps: number | null;
  load: string | null;
  loadValue: string | null;
  loadUnit: "kg" | "lb" | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
  resistance: Resistance | null;
  overrideId: string | null;
  overrideVersion: number | null;
  overriddenFields: string[] | null;
  overrideReps: number | null;
  overrideLoad: string | null;
  overrideLoadValue: string | null;
  overrideLoadUnit: "kg" | "lb" | null;
  overrideDurationSeconds: number | null;
  overrideDistanceMeters: number | null;
  overrideRestSeconds: number | null;
  overrideTempo: string | null;
  overrideNotes: string | null;
  overrideResistance: Resistance | null;
}

async function listAthletePrescriptionItems(
  database: Database,
  input: { organizationId: string; assignmentId: string; teamId?: string },
): Promise<TeamAthletePrescriptionItem[]> {
  const baseItems = await database
    .select({
      recipientId: assignmentRecipients.id,
      athleteUserId: assignmentRecipients.athleteUserId,
      itemSnapshotId: assignmentWorkoutItemSnapshots.id,
      workoutSnapshotId: assignmentWorkoutBlockSnapshots.workoutSnapshotId,
      workoutName: assignmentWorkoutSnapshots.name,
      sourceWorkoutVersion: assignmentWorkoutSnapshots.sourceWorkoutVersion,
      exerciseName: assignmentWorkoutItemSnapshots.exerciseName,
      reps: assignmentWorkoutItemSnapshots.reps,
      load: assignmentWorkoutItemSnapshots.load,
      loadValue: assignmentWorkoutItemSnapshots.loadValue,
      loadUnit: assignmentWorkoutItemSnapshots.loadUnit,
      normalizedLoadKg: assignmentWorkoutItemSnapshots.normalizedLoadKg,
      durationSeconds: assignmentWorkoutItemSnapshots.durationSeconds,
      distanceMeters: assignmentWorkoutItemSnapshots.distanceMeters,
      restSeconds: assignmentWorkoutItemSnapshots.restSeconds,
      tempo: assignmentWorkoutItemSnapshots.tempo,
      notes: assignmentWorkoutItemSnapshots.notes,
      resistanceType: assignmentWorkoutItemSnapshots.resistanceType,
      resistanceValue: assignmentWorkoutItemSnapshots.resistanceValue,
      resistanceUnit: assignmentWorkoutItemSnapshots.resistanceUnit,
      resistancePercentage: assignmentWorkoutItemSnapshots.resistancePercentage,
      resistanceTarget: assignmentWorkoutItemSnapshots.resistanceTarget,
      resistanceDescription:
        assignmentWorkoutItemSnapshots.resistanceDescription,
      normalizedResistanceKg:
        assignmentWorkoutItemSnapshots.normalizedResistanceKg,
    })
    .from(assignmentRecipients)
    .innerJoin(
      assignmentWorkoutItemSnapshots,
      and(
        eq(
          assignmentWorkoutItemSnapshots.organizationId,
          assignmentRecipients.organizationId,
        ),
        eq(
          assignmentWorkoutItemSnapshots.assignmentId,
          assignmentRecipients.assignmentId,
        ),
      ),
    )
    .innerJoin(
      assignmentWorkoutBlockSnapshots,
      and(
        eq(
          assignmentWorkoutBlockSnapshots.organizationId,
          assignmentWorkoutItemSnapshots.organizationId,
        ),
        eq(
          assignmentWorkoutBlockSnapshots.assignmentId,
          assignmentWorkoutItemSnapshots.assignmentId,
        ),
        eq(
          assignmentWorkoutBlockSnapshots.id,
          assignmentWorkoutItemSnapshots.blockSnapshotId,
        ),
      ),
    )
    .innerJoin(
      assignmentWorkoutSnapshots,
      and(
        eq(
          assignmentWorkoutSnapshots.organizationId,
          assignmentWorkoutBlockSnapshots.organizationId,
        ),
        eq(
          assignmentWorkoutSnapshots.assignmentId,
          assignmentWorkoutBlockSnapshots.assignmentId,
        ),
        eq(
          assignmentWorkoutSnapshots.id,
          assignmentWorkoutBlockSnapshots.workoutSnapshotId,
        ),
      ),
    )
    .where(
      and(
        eq(assignmentRecipients.organizationId, input.organizationId),
        eq(assignmentRecipients.assignmentId, input.assignmentId),
        input.teamId
          ? sql`exists (
              select 1 from ${assignmentRecipientTeamScopes} scope
              where scope.organization_id = ${assignmentRecipients.organizationId}
                and scope.assignment_id = ${assignmentRecipients.assignmentId}
                and scope.recipient_id = ${assignmentRecipients.id}
                and scope.team_id = ${input.teamId}
            )`
          : undefined,
      ),
    );

  if (baseItems.length === 0) return [];

  const recipientIds = [...new Set(baseItems.map((item) => item.recipientId))];
  const [slots, overrides] = await Promise.all([
    database
      .select({
        id: assignmentPlanSlotSnapshots.id,
        workoutSnapshotId: assignmentPlanSlotSnapshots.workoutSnapshotId,
        label: assignmentPlanSlotSnapshots.label,
        scheduleType: assignmentPlanSlotSnapshots.scheduleType,
      })
      .from(assignmentPlanSlotSnapshots)
      .where(
        and(
          eq(assignmentPlanSlotSnapshots.organizationId, input.organizationId),
          eq(assignmentPlanSlotSnapshots.assignmentId, input.assignmentId),
        ),
      ),
    database
      .select({
        id: assignmentAthleteItemOverrides.id,
        recipientId: assignmentAthleteItemOverrides.recipientId,
        itemSnapshotId: assignmentAthleteItemOverrides.itemSnapshotId,
        planSlotSnapshotId: assignmentAthleteItemOverrides.planSlotSnapshotId,
        version: assignmentAthleteItemOverrides.version,
        overriddenFields: assignmentAthleteItemOverrides.overriddenFields,
        reps: assignmentAthleteItemOverrides.reps,
        load: assignmentAthleteItemOverrides.load,
        loadValue: assignmentAthleteItemOverrides.loadValue,
        loadUnit: assignmentAthleteItemOverrides.loadUnit,
        normalizedLoadKg: assignmentAthleteItemOverrides.normalizedLoadKg,
        durationSeconds: assignmentAthleteItemOverrides.durationSeconds,
        distanceMeters: assignmentAthleteItemOverrides.distanceMeters,
        restSeconds: assignmentAthleteItemOverrides.restSeconds,
        tempo: assignmentAthleteItemOverrides.tempo,
        notes: assignmentAthleteItemOverrides.notes,
        resistanceType: assignmentAthleteItemOverrides.resistanceType,
        resistanceValue: assignmentAthleteItemOverrides.resistanceValue,
        resistanceUnit: assignmentAthleteItemOverrides.resistanceUnit,
        resistancePercentage:
          assignmentAthleteItemOverrides.resistancePercentage,
        resistanceTarget: assignmentAthleteItemOverrides.resistanceTarget,
        resistanceDescription:
          assignmentAthleteItemOverrides.resistanceDescription,
        normalizedResistanceKg:
          assignmentAthleteItemOverrides.normalizedResistanceKg,
      })
      .from(assignmentAthleteItemOverrides)
      .where(
        and(
          eq(
            assignmentAthleteItemOverrides.organizationId,
            input.organizationId,
          ),
          eq(assignmentAthleteItemOverrides.assignmentId, input.assignmentId),
          inArray(assignmentAthleteItemOverrides.recipientId, recipientIds),
        ),
      ),
  ]);

  return baseItems.flatMap((item) => {
    const itemSlots = slots.filter(
      (slot) => slot.workoutSnapshotId === item.workoutSnapshotId,
    );
    const scopes = itemSlots.length > 0 ? itemSlots : [null];

    return scopes.map((slot) => {
      const override = overrides.find(
        (candidate) =>
          candidate.recipientId === item.recipientId &&
          candidate.itemSnapshotId === item.itemSnapshotId &&
          candidate.planSlotSnapshotId === (slot?.id ?? null),
      );

      return {
        ...item,
        planSlotSnapshotId: slot?.id ?? null,
        planSlotLabel: slot?.label ?? null,
        scheduleType: slot?.scheduleType ?? null,
        overrideId: override?.id ?? null,
        overrideVersion: override?.version ?? null,
        overriddenFields: override?.overriddenFields ?? null,
        overrideReps: override?.reps ?? null,
        overrideLoad: override?.load ?? null,
        overrideLoadValue: override?.loadValue ?? null,
        overrideLoadUnit: override?.loadUnit ?? null,
        overrideDurationSeconds: override?.durationSeconds ?? null,
        overrideDistanceMeters: override?.distanceMeters ?? null,
        overrideRestSeconds: override?.restSeconds ?? null,
        overrideTempo: override?.tempo ?? null,
        overrideNotes: override?.notes ?? null,
        resistance: adaptResistance({
          resistance: resistanceFromPersistence(item),
          legacyLoad: item.load,
          legacyLoadValue: item.loadValue,
          legacyLoadUnit: item.loadUnit,
          legacyNormalizedLoadKg: item.normalizedLoadKg,
        }).resistance,
        overrideResistance: override
          ? adaptResistance({
              resistance: resistanceFromPersistence(override),
              legacyLoad: override.load,
              legacyLoadValue: override.loadValue,
              legacyLoadUnit: override.loadUnit,
              legacyNormalizedLoadKg: override.normalizedLoadKg,
            }).resistance
          : null,
      };
    });
  });
}

export function listTeamAthletePrescriptionItems(
  database: Database,
  input: { organizationId: string; teamId: string; assignmentId: string },
): Promise<TeamAthletePrescriptionItem[]> {
  return listAthletePrescriptionItems(database, input);
}

export function listAssignmentAthletePrescriptionItems(
  database: Database,
  input: { organizationId: string; assignmentId: string },
): Promise<TeamAthletePrescriptionItem[]> {
  return listAthletePrescriptionItems(database, input);
}

export async function listAssignmentPrescriptionRecipients(
  database: Database,
  input: { organizationId: string; assignmentId: string },
): Promise<AssignmentPrescriptionRecipient[]> {
  const rows = await database
    .select({
      recipientId: assignmentRecipients.id,
      athleteUserId: assignmentRecipients.athleteUserId,
      fullName: users.fullName,
      email: users.email,
      teamId: assignmentRecipientTeamScopes.teamId,
      teamName: teams.name,
      isDirectTarget: sql<boolean>`exists (
        select 1 from ${assignmentTargets} direct_target
        where direct_target.organization_id = ${assignmentRecipients.organizationId}
          and direct_target.assignment_id = ${assignmentRecipients.assignmentId}
          and direct_target.target_type = 'athlete'
          and direct_target.athlete_user_id = ${assignmentRecipients.athleteUserId}
      )`,
    })
    .from(assignmentRecipients)
    .innerJoin(users, eq(users.id, assignmentRecipients.athleteUserId))
    .leftJoin(
      assignmentRecipientTeamScopes,
      and(
        eq(
          assignmentRecipientTeamScopes.organizationId,
          assignmentRecipients.organizationId,
        ),
        eq(
          assignmentRecipientTeamScopes.assignmentId,
          assignmentRecipients.assignmentId,
        ),
        eq(assignmentRecipientTeamScopes.recipientId, assignmentRecipients.id),
      ),
    )
    .leftJoin(
      teams,
      and(
        eq(teams.organizationId, assignmentRecipientTeamScopes.organizationId),
        eq(teams.id, assignmentRecipientTeamScopes.teamId),
      ),
    )
    .where(
      and(
        eq(assignmentRecipients.organizationId, input.organizationId),
        eq(assignmentRecipients.assignmentId, input.assignmentId),
      ),
    )
    .orderBy(asc(users.fullName), asc(users.email), asc(teams.name));
  const recipients = new Map<string, AssignmentPrescriptionRecipient>();

  for (const row of rows) {
    const recipient = recipients.get(row.recipientId) ?? {
      recipientId: row.recipientId,
      athleteUserId: row.athleteUserId,
      fullName: row.fullName,
      email: row.email,
      teamIds: [],
      teamNames: [],
      isDirectTarget: row.isDirectTarget,
    };
    if (row.teamId) recipient.teamIds.push(row.teamId);
    if (row.teamName) recipient.teamNames.push(row.teamName);
    recipients.set(row.recipientId, recipient);
  }

  return [...recipients.values()];
}

export async function findPreparedRecipientRosterChanges(
  database: Database,
  input: { organizationId: string; assignmentId: string },
): Promise<PreparedRecipientRosterChanges> {
  const [preparedRows, targetRows] = await Promise.all([
    database
      .select({
        athleteUserId: assignmentRecipients.athleteUserId,
        organizationRole: organizationMemberships.role,
      })
      .from(assignmentRecipients)
      .leftJoin(
        organizationMemberships,
        and(
          eq(
            organizationMemberships.organizationId,
            assignmentRecipients.organizationId,
          ),
          eq(
            organizationMemberships.userId,
            assignmentRecipients.athleteUserId,
          ),
        ),
      )
      .where(
        and(
          eq(assignmentRecipients.organizationId, input.organizationId),
          eq(assignmentRecipients.assignmentId, input.assignmentId),
        ),
      ),
    database
      .select({
        targetType: assignmentTargets.targetType,
        teamId: assignmentTargets.teamId,
        athleteUserId: assignmentTargets.athleteUserId,
      })
      .from(assignmentTargets)
      .where(
        and(
          eq(assignmentTargets.organizationId, input.organizationId),
          eq(assignmentTargets.assignmentId, input.assignmentId),
        ),
      ),
  ]);
  const currentRecipientIds = new Set<string>();
  const directAthleteIds = targetRows.flatMap((target) =>
    target.targetType === "athlete" && target.athleteUserId
      ? [target.athleteUserId]
      : [],
  );
  const teamIds = targetRows.flatMap((target) =>
    target.targetType === "team" && target.teamId ? [target.teamId] : [],
  );
  const [directAthletes, teamAthletes] = await Promise.all([
    directAthleteIds.length === 0
      ? []
      : database
          .select({ athleteUserId: organizationMemberships.userId })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, input.organizationId),
              eq(organizationMemberships.role, "athlete"),
              inArray(organizationMemberships.userId, directAthleteIds),
            ),
          ),
    teamIds.length === 0
      ? []
      : database
          .select({ athleteUserId: teamMemberships.userId })
          .from(teamMemberships)
          .innerJoin(
            organizationMemberships,
            and(
              eq(
                organizationMemberships.organizationId,
                teamMemberships.organizationId,
              ),
              eq(organizationMemberships.userId, teamMemberships.userId),
            ),
          )
          .where(
            and(
              eq(teamMemberships.organizationId, input.organizationId),
              inArray(teamMemberships.teamId, teamIds),
              eq(organizationMemberships.role, "athlete"),
            ),
          ),
  ]);
  for (const athlete of [...directAthletes, ...teamAthletes]) {
    currentRecipientIds.add(athlete.athleteUserId);
  }

  const preparedRecipientIds = new Set(
    preparedRows.map((row) => row.athleteUserId),
  );
  return {
    addedAthleteUserIds: [...currentRecipientIds].filter(
      (athleteUserId) => !preparedRecipientIds.has(athleteUserId),
    ),
    removedAthleteUserIds: [...preparedRecipientIds].filter(
      (athleteUserId) => !currentRecipientIds.has(athleteUserId),
    ),
    ineligibleAthleteUserIds: preparedRows
      .filter((row) => row.organizationRole !== "athlete")
      .map((row) => row.athleteUserId),
  };
}
