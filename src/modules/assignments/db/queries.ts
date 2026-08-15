import "server-only";

import { and, asc, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  assignments,
  assignmentAthleteItemOverrides,
  assignmentRecipients,
  assignmentSessionEffectiveItemPrescriptions,
  assignmentSessionItemResults,
  assignmentSessions,
  assignmentTargets,
  assignmentPlanSlotSnapshots,
  assignmentWorkoutBlockSnapshots,
  assignmentWorkoutItemSnapshots,
  assignmentWorkoutSnapshots,
  type Assignment,
  type AssignmentTarget,
} from "@/modules/assignments/db/schema";
import { plans } from "@/modules/plans/db/schema";
import type { PlanDayOfWeek } from "@/modules/plans/db/schema";
import { teams } from "@/modules/teams/db/schema";
import { users } from "@/modules/users/db/schema";
import { workouts } from "@/modules/workouts/db/schema";
import {
  resistanceFromPersistence,
  type Resistance,
} from "@/modules/resistance/application/resistance";

export interface AssignmentListItem extends Assignment {
  sourceName: string;
  sourceType: "plan" | "workout";
  targetCount: number;
  recipientCount: number;
}

export interface AssignmentTargetDetail extends AssignmentTarget {
  teamName: string | null;
  athleteEmail: string | null;
  athleteFullName: string | null;
}

export interface AssignmentDetail extends AssignmentListItem {
  targets: AssignmentTargetDetail[];
}

export interface AthleteAssignmentListItem {
  id: string;
  sourceName: string;
  sourceType: "plan" | "workout";
  status: "published" | "canceled";
  startDate: string | null;
  endDate: string | null;
  scheduledDate: string | null;
  publishedAt: Date | null;
}

export interface AthleteAssignmentDetail extends AthleteAssignmentListItem {
  timezone: string;
  availableFrom: Date | null;
  availableUntil: Date | null;
  targetCount: number;
  recipientCount: number;
}

export interface AthleteAssignmentSessionSummary {
  id: string;
  workoutSnapshotId: string;
  status: "assigned" | "in_progress" | "submitted";
  version: number;
  startedAt: Date | null;
  submittedAt: Date | null;
  resultCount: number;
}

export interface AthleteAssignmentWorkoutSummary {
  id: string;
  name: string;
  position: number;
}

export interface AthletePlanSlotSnapshot {
  id: string;
  workoutSnapshotId: string;
  workoutName: string;
  scheduleType: "fixed_day" | "weekly_frequency";
  dayOfWeek: PlanDayOfWeek | null;
  targetSessionsPerWeek: number | null;
  position: number;
  label: string | null;
}

export interface AthletePlanSessionSummary {
  id: string;
  workoutSnapshotId: string;
  planSlotSnapshotId: string | null;
  scheduledDate: string;
  status: "assigned" | "in_progress" | "submitted";
  version: number;
  startedAt: Date | null;
  submittedAt: Date | null;
  durationMinutes: number | null;
  sessionRpe: number | null;
}

export interface AthleteWorkoutItemSnapshot {
  id: string;
  exerciseName: string;
  blockLabel: string | null;
  blockPosition: number;
  itemPosition: number;
  reps: number | null;
  load: string | null;
  loadValue: string | null;
  loadUnit: "kg" | "lb" | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export interface AthleteSessionResultItem {
  itemSnapshotId: string;
  completedAt: Date;
  roundNumber: number;
  reps: number | null;
  load: string | null;
  loadValue: string | null;
  loadUnit: "kg" | "lb" | null;
  normalizedLoadKg: string | null;
  resistance: Resistance | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  notes: string | null;
}

function assignmentAccessCondition(managedTeamIds: readonly string[]): SQL {
  if (managedTeamIds.length === 0) {
    return sql`false`;
  }

  const teamIds = sql.join(
    managedTeamIds.map((teamId) => sql`${teamId}`),
    sql`, `,
  );

  return sql`not exists (
    select 1
    from assignment_targets scope_target
    where scope_target.organization_id = ${assignments.organizationId}
      and scope_target.assignment_id = ${assignments.id}
      and not (
        (scope_target.target_type = 'team' and scope_target.team_id in (${teamIds}))
        or (
          scope_target.target_type = 'athlete'
          and exists (
            select 1
            from team_memberships scope_membership
            where scope_membership.organization_id = ${assignments.organizationId}
              and scope_membership.user_id = scope_target.athlete_user_id
              and scope_membership.team_id in (${teamIds})
          )
        )
      )
  )`;
}

export async function listAssignmentsForOrganization(
  database: Database,
  input: { organizationId: string; managedTeamIds?: readonly string[] },
): Promise<AssignmentListItem[]> {
  const rows = await database
    .select({
      id: assignments.id,
      organizationId: assignments.organizationId,
      sourcePlanId: assignments.sourcePlanId,
      sourceWorkoutId: assignments.sourceWorkoutId,
      timezone: assignments.timezone,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
      scheduledDate: assignments.scheduledDate,
      availableFrom: assignments.availableFrom,
      availableUntil: assignments.availableUntil,
      timelinessPolicyVersion: assignments.timelinessPolicyVersion,
      timelinessPolicyEffectiveAt: assignments.timelinessPolicyEffectiveAt,
      fixedDueLocalMinute: assignments.fixedDueLocalMinute,
      weeklyDueDay: assignments.weeklyDueDay,
      weeklyDueLocalMinute: assignments.weeklyDueLocalMinute,
      lateEntryDays: assignments.lateEntryDays,
      status: assignments.status,
      preparedAt: assignments.preparedAt,
      preparedByUserId: assignments.preparedByUserId,
      preparationResetAt: assignments.preparationResetAt,
      preparationResetByUserId: assignments.preparationResetByUserId,
      publishedAt: assignments.publishedAt,
      canceledAt: assignments.canceledAt,
      version: assignments.version,
      createdByUserId: assignments.createdByUserId,
      updatedByUserId: assignments.updatedByUserId,
      createdAt: assignments.createdAt,
      updatedAt: assignments.updatedAt,
      planName: plans.name,
      workoutName: workouts.name,
      targetCount: sql<number>`count(distinct ${assignmentTargets.id})::int`.as(
        "target_count",
      ),
      recipientCount:
        sql<number>`count(distinct ${assignmentRecipients.id})::int`.as(
          "recipient_count",
        ),
    })
    .from(assignments)
    .leftJoin(
      plans,
      and(
        eq(plans.organizationId, assignments.organizationId),
        eq(plans.id, assignments.sourcePlanId),
      ),
    )
    .leftJoin(
      workouts,
      and(
        eq(workouts.organizationId, assignments.organizationId),
        eq(workouts.id, assignments.sourceWorkoutId),
      ),
    )
    .leftJoin(
      assignmentTargets,
      and(
        eq(assignmentTargets.organizationId, assignments.organizationId),
        eq(assignmentTargets.assignmentId, assignments.id),
      ),
    )
    .leftJoin(
      assignmentRecipients,
      and(
        eq(assignmentRecipients.organizationId, assignments.organizationId),
        eq(assignmentRecipients.assignmentId, assignments.id),
      ),
    )
    .where(
      and(
        eq(assignments.organizationId, input.organizationId),
        input.managedTeamIds
          ? assignmentAccessCondition(input.managedTeamIds)
          : undefined,
      ),
    )
    .groupBy(assignments.id, plans.name, workouts.name)
    .orderBy(asc(assignments.createdAt));

  return rows.map((row) => ({
    ...row,
    sourceName: row.planName ?? row.workoutName ?? "Unknown",
    sourceType: row.sourcePlanId ? "plan" : "workout",
  }));
}

export async function findAssignmentByOrganization(
  database: Database,
  input: {
    organizationId: string;
    assignmentId: string;
    managedTeamIds?: readonly string[];
  },
): Promise<AssignmentDetail | null> {
  const [assignment] = await listAssignmentsForOrganization(database, {
    organizationId: input.organizationId,
    managedTeamIds: input.managedTeamIds,
  }).then((items) => items.filter((item) => item.id === input.assignmentId));

  if (!assignment) {
    return null;
  }

  const targets = await database
    .select({
      id: assignmentTargets.id,
      organizationId: assignmentTargets.organizationId,
      assignmentId: assignmentTargets.assignmentId,
      targetType: assignmentTargets.targetType,
      teamId: assignmentTargets.teamId,
      athleteUserId: assignmentTargets.athleteUserId,
      createdAt: assignmentTargets.createdAt,
      teamName: teams.name,
      athleteEmail: users.email,
      athleteFullName: users.fullName,
    })
    .from(assignmentTargets)
    .leftJoin(
      teams,
      and(
        eq(teams.organizationId, assignmentTargets.organizationId),
        eq(teams.id, assignmentTargets.teamId),
      ),
    )
    .leftJoin(users, eq(users.id, assignmentTargets.athleteUserId))
    .where(
      and(
        eq(assignmentTargets.organizationId, input.organizationId),
        eq(assignmentTargets.assignmentId, input.assignmentId),
      ),
    )
    .orderBy(asc(assignmentTargets.createdAt));

  return {
    ...assignment,
    targets,
  };
}

export async function listPublishedAssignmentsForAthlete(
  database: Database,
  input: { organizationId: string; athleteUserId: string },
): Promise<AthleteAssignmentListItem[]> {
  const rows = await database
    .select({
      id: assignments.id,
      sourcePlanId: assignments.sourcePlanId,
      sourceWorkoutId: assignments.sourceWorkoutId,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
      scheduledDate: assignments.scheduledDate,
      status: assignments.status,
      publishedAt: assignments.publishedAt,
      planName: plans.name,
      workoutName: workouts.name,
    })
    .from(assignmentRecipients)
    .innerJoin(
      assignments,
      and(
        eq(assignments.organizationId, assignmentRecipients.organizationId),
        eq(assignments.id, assignmentRecipients.assignmentId),
      ),
    )
    .leftJoin(
      plans,
      and(
        eq(plans.organizationId, assignments.organizationId),
        eq(plans.id, assignments.sourcePlanId),
      ),
    )
    .leftJoin(
      workouts,
      and(
        eq(workouts.organizationId, assignments.organizationId),
        eq(workouts.id, assignments.sourceWorkoutId),
      ),
    )
    .where(
      and(
        eq(assignmentRecipients.organizationId, input.organizationId),
        eq(assignmentRecipients.athleteUserId, input.athleteUserId),
        sql`(
          ${assignments.status} = 'published'
          or (
            ${assignments.status} = 'canceled'
            and exists (
              select 1 from ${assignmentSessions}
              where ${assignmentSessions.organizationId} = ${assignments.organizationId}
                and ${assignmentSessions.assignmentId} = ${assignments.id}
                and ${assignmentSessions.athleteUserId} = ${input.athleteUserId}
            )
          )
        )`,
      ),
    )
    .orderBy(asc(assignments.publishedAt), asc(assignments.createdAt));

  return rows.map((row) => ({
    id: row.id,
    sourceName: row.planName ?? row.workoutName ?? "Unknown",
    sourceType: row.sourcePlanId ? "plan" : "workout",
    status: row.status as "published" | "canceled",
    startDate: row.startDate,
    endDate: row.endDate,
    scheduledDate: row.scheduledDate,
    publishedAt: row.publishedAt,
  }));
}

export async function findPublishedAssignmentForAthlete(
  database: Database,
  input: {
    organizationId: string;
    athleteUserId: string;
    assignmentId: string;
  },
): Promise<AthleteAssignmentDetail | null> {
  const [assignment] = await database
    .select({
      id: assignments.id,
      sourcePlanId: assignments.sourcePlanId,
      sourceWorkoutId: assignments.sourceWorkoutId,
      timezone: assignments.timezone,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
      scheduledDate: assignments.scheduledDate,
      availableFrom: assignments.availableFrom,
      availableUntil: assignments.availableUntil,
      status: assignments.status,
      publishedAt: assignments.publishedAt,
      planName: plans.name,
      workoutName: workouts.name,
      targetCount: sql<number>`(
        SELECT count(*)::int FROM ${assignmentTargets}
        WHERE ${assignmentTargets.organizationId} = ${assignments.organizationId}
          AND ${assignmentTargets.assignmentId} = ${assignments.id}
      )`.as("target_count"),
      recipientCount: sql<number>`(
        SELECT count(*)::int FROM ${assignmentRecipients}
        WHERE ${assignmentRecipients.organizationId} = ${assignments.organizationId}
          AND ${assignmentRecipients.assignmentId} = ${assignments.id}
      )`.as("recipient_count"),
    })
    .from(assignmentRecipients)
    .innerJoin(
      assignments,
      and(
        eq(assignments.organizationId, assignmentRecipients.organizationId),
        eq(assignments.id, assignmentRecipients.assignmentId),
      ),
    )
    .leftJoin(
      plans,
      and(
        eq(plans.organizationId, assignments.organizationId),
        eq(plans.id, assignments.sourcePlanId),
      ),
    )
    .leftJoin(
      workouts,
      and(
        eq(workouts.organizationId, assignments.organizationId),
        eq(workouts.id, assignments.sourceWorkoutId),
      ),
    )
    .where(
      and(
        eq(assignments.organizationId, input.organizationId),
        eq(assignments.id, input.assignmentId),
        sql`(
          ${assignments.status} = 'published'
          or (
            ${assignments.status} = 'canceled'
            and exists (
              select 1 from ${assignmentSessions}
              where ${assignmentSessions.organizationId} = ${assignments.organizationId}
                and ${assignmentSessions.assignmentId} = ${assignments.id}
                and ${assignmentSessions.athleteUserId} = ${input.athleteUserId}
            )
          )
        )`,
        eq(assignmentRecipients.athleteUserId, input.athleteUserId),
      ),
    )
    .limit(1);

  if (!assignment) {
    return null;
  }

  return {
    id: assignment.id,
    sourceName: assignment.planName ?? assignment.workoutName ?? "Unknown",
    sourceType: assignment.sourcePlanId ? "plan" : "workout",
    status: assignment.status as "published" | "canceled",
    timezone: assignment.timezone,
    startDate: assignment.startDate,
    endDate: assignment.endDate,
    scheduledDate: assignment.scheduledDate,
    availableFrom: assignment.availableFrom,
    availableUntil: assignment.availableUntil,
    publishedAt: assignment.publishedAt,
    targetCount: assignment.targetCount,
    recipientCount: assignment.recipientCount,
  };
}

export async function findLatestSessionForAthleteAssignment(
  database: Database,
  input: {
    organizationId: string;
    athleteUserId: string;
    assignmentId: string;
  },
): Promise<AthleteAssignmentSessionSummary | null> {
  const [session] = await database
    .select({
      id: assignmentSessions.id,
      workoutSnapshotId: assignmentSessions.workoutSnapshotId,
      status: assignmentSessions.status,
      version: assignmentSessions.version,
      startedAt: assignmentSessions.startedAt,
      submittedAt: assignmentSessions.submittedAt,
      durationMinutes: assignmentSessions.durationMinutes,
      sessionRpe: assignmentSessions.sessionRpe,
      resultCount: sql<number>`(
          SELECT count(*)::int FROM ${assignmentSessionItemResults}
          WHERE ${assignmentSessionItemResults.organizationId} = ${assignmentSessions.organizationId}
            AND ${assignmentSessionItemResults.assignmentId} = ${assignmentSessions.assignmentId}
            AND ${assignmentSessionItemResults.sessionId} = ${assignmentSessions.id}
        )`.as("result_count"),
    })
    .from(assignmentSessions)
    .where(
      and(
        eq(assignmentSessions.organizationId, input.organizationId),
        eq(assignmentSessions.assignmentId, input.assignmentId),
        eq(assignmentSessions.athleteUserId, input.athleteUserId),
      ),
    )
    .orderBy(desc(assignmentSessions.createdAt))
    .limit(1);

  return session ?? null;
}

export async function listWorkoutsForAthleteAssignment(
  database: Database,
  input: {
    organizationId: string;
    assignmentId: string;
  },
): Promise<AthleteAssignmentWorkoutSummary[]> {
  const rows = await database
    .select({
      id: assignmentWorkoutSnapshots.id,
      name: assignmentWorkoutSnapshots.name,
      position: assignmentWorkoutSnapshots.position,
    })
    .from(assignmentWorkoutSnapshots)
    .where(
      and(
        eq(assignmentWorkoutSnapshots.organizationId, input.organizationId),
        eq(assignmentWorkoutSnapshots.assignmentId, input.assignmentId),
      ),
    )
    .orderBy(asc(assignmentWorkoutSnapshots.position));

  return rows;
}

export async function listPlanSlotSnapshotsForAthleteAssignment(
  database: Database,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
  },
): Promise<AthletePlanSlotSnapshot[]> {
  const [recipient] = await database
    .select({ id: assignmentRecipients.id })
    .from(assignmentRecipients)
    .where(
      and(
        eq(assignmentRecipients.organizationId, input.organizationId),
        eq(assignmentRecipients.assignmentId, input.assignmentId),
        eq(assignmentRecipients.athleteUserId, input.athleteUserId),
      ),
    )
    .limit(1);

  if (!recipient) {
    return [];
  }

  const results = await database
    .select({
      id: assignmentPlanSlotSnapshots.id,
      workoutSnapshotId: assignmentPlanSlotSnapshots.workoutSnapshotId,
      workoutName: assignmentWorkoutSnapshots.name,
      scheduleType: assignmentPlanSlotSnapshots.scheduleType,
      dayOfWeek: assignmentPlanSlotSnapshots.dayOfWeek,
      targetSessionsPerWeek: assignmentPlanSlotSnapshots.targetSessionsPerWeek,
      position: assignmentPlanSlotSnapshots.position,
      label: assignmentPlanSlotSnapshots.label,
    })
    .from(assignmentPlanSlotSnapshots)
    .innerJoin(
      assignmentWorkoutSnapshots,
      and(
        eq(
          assignmentWorkoutSnapshots.organizationId,
          assignmentPlanSlotSnapshots.organizationId,
        ),
        eq(
          assignmentWorkoutSnapshots.assignmentId,
          assignmentPlanSlotSnapshots.assignmentId,
        ),
        eq(
          assignmentWorkoutSnapshots.id,
          assignmentPlanSlotSnapshots.workoutSnapshotId,
        ),
      ),
    )
    .where(
      and(
        eq(assignmentPlanSlotSnapshots.organizationId, input.organizationId),
        eq(assignmentPlanSlotSnapshots.assignmentId, input.assignmentId),
      ),
    )
    .orderBy(asc(assignmentPlanSlotSnapshots.position));

  return results;
}

export async function listSessionsForAthleteAssignment(
  database: Database,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
  },
): Promise<AthletePlanSessionSummary[]> {
  const results = await database
    .select({
      id: assignmentSessions.id,
      workoutSnapshotId: assignmentSessions.workoutSnapshotId,
      planSlotSnapshotId: assignmentSessions.planSlotSnapshotId,
      scheduledDate: assignmentSessions.scheduledDate,
      status: assignmentSessions.status,
      version: assignmentSessions.version,
      startedAt: assignmentSessions.startedAt,
      submittedAt: assignmentSessions.submittedAt,
      durationMinutes: assignmentSessions.durationMinutes,
      sessionRpe: assignmentSessions.sessionRpe,
    })
    .from(assignmentSessions)
    .where(
      and(
        eq(assignmentSessions.organizationId, input.organizationId),
        eq(assignmentSessions.assignmentId, input.assignmentId),
        eq(assignmentSessions.athleteUserId, input.athleteUserId),
      ),
    )
    .orderBy(asc(assignmentSessions.scheduledDate));

  return results;
}

export async function listWorkoutItemsForSnapshot(
  database: Database,
  input: {
    organizationId: string;
    assignmentId: string;
    workoutSnapshotId: string;
  },
): Promise<AthleteWorkoutItemSnapshot[]> {
  return database
    .select({
      id: assignmentWorkoutItemSnapshots.id,
      exerciseName: assignmentWorkoutItemSnapshots.exerciseName,
      blockLabel: assignmentWorkoutBlockSnapshots.label,
      blockPosition: assignmentWorkoutBlockSnapshots.position,
      itemPosition: assignmentWorkoutItemSnapshots.position,
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
    .from(assignmentWorkoutItemSnapshots)
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
        eq(assignmentWorkoutItemSnapshots.organizationId, input.organizationId),
        eq(assignmentWorkoutItemSnapshots.assignmentId, input.assignmentId),
        eq(
          assignmentWorkoutBlockSnapshots.workoutSnapshotId,
          input.workoutSnapshotId,
        ),
      ),
    )
    .orderBy(
      asc(assignmentWorkoutBlockSnapshots.position),
      asc(assignmentWorkoutItemSnapshots.position),
    );
}

export async function listEffectiveWorkoutItemsForAthleteOccurrence(
  database: Database,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
    workoutSnapshotId: string;
    planSlotSnapshotId: string | null;
    sessionId: string | null;
  },
): Promise<AthleteWorkoutItemSnapshot[]> {
  const [recipient] = await database
    .select({ id: assignmentRecipients.id })
    .from(assignmentRecipients)
    .where(
      and(
        eq(assignmentRecipients.organizationId, input.organizationId),
        eq(assignmentRecipients.assignmentId, input.assignmentId),
        eq(assignmentRecipients.athleteUserId, input.athleteUserId),
      ),
    )
    .limit(1);

  if (!recipient) return [];

  const baseItems = await listWorkoutItemsForSnapshot(database, input);
  if (baseItems.length === 0) return [];

  if (input.sessionId) {
    const effectiveRows = await database
      .select({
        itemSnapshotId:
          assignmentSessionEffectiveItemPrescriptions.itemSnapshotId,
        reps: assignmentSessionEffectiveItemPrescriptions.reps,
        load: assignmentSessionEffectiveItemPrescriptions.load,
        loadValue: assignmentSessionEffectiveItemPrescriptions.loadValue,
        loadUnit: assignmentSessionEffectiveItemPrescriptions.loadUnit,
        durationSeconds:
          assignmentSessionEffectiveItemPrescriptions.durationSeconds,
        distanceMeters:
          assignmentSessionEffectiveItemPrescriptions.distanceMeters,
        restSeconds: assignmentSessionEffectiveItemPrescriptions.restSeconds,
        tempo: assignmentSessionEffectiveItemPrescriptions.tempo,
        notes: assignmentSessionEffectiveItemPrescriptions.notes,
      })
      .from(assignmentSessionEffectiveItemPrescriptions)
      .innerJoin(
        assignmentSessions,
        and(
          eq(
            assignmentSessions.organizationId,
            assignmentSessionEffectiveItemPrescriptions.organizationId,
          ),
          eq(
            assignmentSessions.assignmentId,
            assignmentSessionEffectiveItemPrescriptions.assignmentId,
          ),
          eq(
            assignmentSessions.id,
            assignmentSessionEffectiveItemPrescriptions.sessionId,
          ),
        ),
      )
      .where(
        and(
          eq(
            assignmentSessionEffectiveItemPrescriptions.organizationId,
            input.organizationId,
          ),
          eq(
            assignmentSessionEffectiveItemPrescriptions.assignmentId,
            input.assignmentId,
          ),
          eq(
            assignmentSessionEffectiveItemPrescriptions.sessionId,
            input.sessionId,
          ),
          eq(assignmentSessions.athleteUserId, input.athleteUserId),
        ),
      );
    const effectiveByItem = new Map(
      effectiveRows.map((row) => [row.itemSnapshotId, row]),
    );

    return baseItems.map((item) => ({
      ...item,
      ...effectiveByItem.get(item.id),
      id: item.id,
    }));
  }

  const overrideRows = await database
    .select({
      itemSnapshotId: assignmentAthleteItemOverrides.itemSnapshotId,
      planSlotSnapshotId: assignmentAthleteItemOverrides.planSlotSnapshotId,
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
        eq(assignmentAthleteItemOverrides.organizationId, input.organizationId),
        eq(assignmentAthleteItemOverrides.assignmentId, input.assignmentId),
        eq(assignmentAthleteItemOverrides.recipientId, recipient.id),
        input.planSlotSnapshotId
          ? or(
              eq(
                assignmentAthleteItemOverrides.planSlotSnapshotId,
                input.planSlotSnapshotId,
              ),
              isNull(assignmentAthleteItemOverrides.planSlotSnapshotId),
            )
          : isNull(assignmentAthleteItemOverrides.planSlotSnapshotId),
      ),
    );
  const overrideByItem = new Map<string, (typeof overrideRows)[number]>();
  for (const override of overrideRows) {
    const current = overrideByItem.get(override.itemSnapshotId);
    if (!current || override.planSlotSnapshotId !== null) {
      overrideByItem.set(override.itemSnapshotId, override);
    }
  }

  return baseItems.map((item) => {
    const override = overrideByItem.get(item.id);
    if (!override) return item;

    const overriddenFields = new Set(override.overriddenFields);
    return {
      ...item,
      reps: overriddenFields.has("reps") ? override.reps : item.reps,
      load: overriddenFields.has("load") ? override.load : item.load,
      loadValue: overriddenFields.has("load")
        ? override.loadValue
        : item.loadValue,
      loadUnit: overriddenFields.has("load")
        ? override.loadUnit
        : item.loadUnit,
      durationSeconds: overriddenFields.has("durationSeconds")
        ? override.durationSeconds
        : item.durationSeconds,
      distanceMeters: overriddenFields.has("distanceMeters")
        ? override.distanceMeters
        : item.distanceMeters,
      restSeconds: overriddenFields.has("restSeconds")
        ? override.restSeconds
        : item.restSeconds,
      tempo: overriddenFields.has("tempo") ? override.tempo : item.tempo,
      notes: overriddenFields.has("notes") ? override.notes : item.notes,
    };
  });
}

export async function listPrimaryWorkoutItemsForAssignment(
  database: Database,
  input: {
    organizationId: string;
    assignmentId: string;
  },
): Promise<AthleteWorkoutItemSnapshot[]> {
  const [workoutSnapshot] = await database
    .select({ id: assignmentWorkoutSnapshots.id })
    .from(assignmentWorkoutSnapshots)
    .where(
      and(
        eq(assignmentWorkoutSnapshots.organizationId, input.organizationId),
        eq(assignmentWorkoutSnapshots.assignmentId, input.assignmentId),
      ),
    )
    .orderBy(asc(assignmentWorkoutSnapshots.position))
    .limit(1);

  if (!workoutSnapshot) {
    return [];
  }

  return database
    .select({
      id: assignmentWorkoutItemSnapshots.id,
      exerciseName: assignmentWorkoutItemSnapshots.exerciseName,
      blockLabel: assignmentWorkoutBlockSnapshots.label,
      blockPosition: assignmentWorkoutBlockSnapshots.position,
      itemPosition: assignmentWorkoutItemSnapshots.position,
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
    .from(assignmentWorkoutItemSnapshots)
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
        eq(assignmentWorkoutItemSnapshots.organizationId, input.organizationId),
        eq(assignmentWorkoutItemSnapshots.assignmentId, input.assignmentId),
        eq(
          assignmentWorkoutBlockSnapshots.workoutSnapshotId,
          workoutSnapshot.id,
        ),
      ),
    )
    .orderBy(
      asc(assignmentWorkoutBlockSnapshots.position),
      asc(assignmentWorkoutItemSnapshots.position),
    );
}

export async function listSessionResultsForAthleteAssignment(
  database: Database,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
    sessionId: string;
  },
): Promise<AthleteSessionResultItem[]> {
  const [session] = await database
    .select({ id: assignmentSessions.id })
    .from(assignmentSessions)
    .where(
      and(
        eq(assignmentSessions.organizationId, input.organizationId),
        eq(assignmentSessions.assignmentId, input.assignmentId),
        eq(assignmentSessions.id, input.sessionId),
        eq(assignmentSessions.athleteUserId, input.athleteUserId),
      ),
    )
    .limit(1);

  if (!session) {
    return [];
  }

  const results = await database
    .select({
      itemSnapshotId: assignmentSessionItemResults.itemSnapshotId,
      completedAt: assignmentSessionItemResults.completedAt,
      roundNumber: assignmentSessionItemResults.roundNumber,
      reps: assignmentSessionItemResults.reps,
      load: assignmentSessionItemResults.load,
      loadValue: assignmentSessionItemResults.loadValue,
      loadUnit: assignmentSessionItemResults.loadUnit,
      normalizedLoadKg: assignmentSessionItemResults.normalizedLoadKg,
      resistanceType: assignmentSessionItemResults.resistanceType,
      resistanceValue: assignmentSessionItemResults.resistanceValue,
      resistanceUnit: assignmentSessionItemResults.resistanceUnit,
      resistancePercentage: assignmentSessionItemResults.resistancePercentage,
      resistanceTarget: assignmentSessionItemResults.resistanceTarget,
      resistanceDescription: assignmentSessionItemResults.resistanceDescription,
      normalizedResistanceKg:
        assignmentSessionItemResults.normalizedResistanceKg,
      durationSeconds: assignmentSessionItemResults.durationSeconds,
      distanceMeters: assignmentSessionItemResults.distanceMeters,
      notes: assignmentSessionItemResults.notes,
    })
    .from(assignmentSessionItemResults)
    .where(
      and(
        eq(assignmentSessionItemResults.organizationId, input.organizationId),
        eq(assignmentSessionItemResults.assignmentId, input.assignmentId),
        eq(assignmentSessionItemResults.sessionId, input.sessionId),
      ),
    );

  return results.map((result) => ({
    ...result,
    resistance: resistanceFromPersistence(result),
  }));
}
