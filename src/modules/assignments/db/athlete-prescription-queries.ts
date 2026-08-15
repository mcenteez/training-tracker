import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  assignmentAthleteItemOverrides,
  assignmentPlanSlotSnapshots,
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentWorkoutBlockSnapshots,
  assignmentWorkoutItemSnapshots,
  assignmentWorkoutSnapshots,
} from "@/modules/assignments/db/schema";
import { teams } from "@/modules/teams/db/schema";
import { users } from "@/modules/users/db/schema";

export interface AssignmentPrescriptionRecipient {
  recipientId: string;
  athleteUserId: string;
  fullName: string | null;
  email: string;
  teamIds: string[];
  teamNames: string[];
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
      durationSeconds: assignmentWorkoutItemSnapshots.durationSeconds,
      distanceMeters: assignmentWorkoutItemSnapshots.distanceMeters,
      restSeconds: assignmentWorkoutItemSnapshots.restSeconds,
      tempo: assignmentWorkoutItemSnapshots.tempo,
      notes: assignmentWorkoutItemSnapshots.notes,
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
        durationSeconds: assignmentAthleteItemOverrides.durationSeconds,
        distanceMeters: assignmentAthleteItemOverrides.distanceMeters,
        restSeconds: assignmentAthleteItemOverrides.restSeconds,
        tempo: assignmentAthleteItemOverrides.tempo,
        notes: assignmentAthleteItemOverrides.notes,
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
    };
    if (row.teamId) recipient.teamIds.push(row.teamId);
    if (row.teamName) recipient.teamNames.push(row.teamName);
    recipients.set(row.recipientId, recipient);
  }

  return [...recipients.values()];
}
