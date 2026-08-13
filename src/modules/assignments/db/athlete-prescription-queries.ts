import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  assignmentAthleteItemOverrides,
  assignmentPlanSlotSnapshots,
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentWorkoutBlockSnapshots,
  assignmentWorkoutItemSnapshots,
} from "@/modules/assignments/db/schema";

export interface TeamAthletePrescriptionItem {
  recipientId: string;
  athleteUserId: string;
  itemSnapshotId: string;
  workoutSnapshotId: string;
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

export async function listTeamAthletePrescriptionItems(
  database: Database,
  input: { organizationId: string; teamId: string; assignmentId: string },
): Promise<TeamAthletePrescriptionItem[]> {
  const baseItems = await database
    .select({
      recipientId: assignmentRecipients.id,
      athleteUserId: assignmentRecipients.athleteUserId,
      itemSnapshotId: assignmentWorkoutItemSnapshots.id,
      workoutSnapshotId: assignmentWorkoutBlockSnapshots.workoutSnapshotId,
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
    .from(assignmentRecipientTeamScopes)
    .innerJoin(
      assignmentRecipients,
      and(
        eq(
          assignmentRecipients.organizationId,
          assignmentRecipientTeamScopes.organizationId,
        ),
        eq(
          assignmentRecipients.assignmentId,
          assignmentRecipientTeamScopes.assignmentId,
        ),
        eq(assignmentRecipients.id, assignmentRecipientTeamScopes.recipientId),
      ),
    )
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
    .where(
      and(
        eq(assignmentRecipientTeamScopes.organizationId, input.organizationId),
        eq(assignmentRecipientTeamScopes.teamId, input.teamId),
        eq(assignmentRecipientTeamScopes.assignmentId, input.assignmentId),
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
