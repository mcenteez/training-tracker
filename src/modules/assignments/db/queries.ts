import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  assignments,
  assignmentRecipients,
  assignmentTargets,
  type Assignment,
  type AssignmentTarget,
} from "@/modules/assignments/db/schema";
import { plans } from "@/modules/plans/db/schema";
import { teams } from "@/modules/teams/db/schema";
import { users } from "@/modules/users/db/schema";
import { workouts } from "@/modules/workouts/db/schema";

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
  status: "published";
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

export async function listAssignmentsForOrganization(
  database: Database,
  input: { organizationId: string },
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
      status: assignments.status,
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
    .where(eq(assignments.organizationId, input.organizationId))
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
  input: { organizationId: string; assignmentId: string },
): Promise<AssignmentDetail | null> {
  const [assignment] = await listAssignmentsForOrganization(database, {
    organizationId: input.organizationId,
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
        eq(assignments.status, "published"),
      ),
    )
    .orderBy(asc(assignments.publishedAt), asc(assignments.createdAt));

  return rows.map((row) => ({
    id: row.id,
    sourceName: row.planName ?? row.workoutName ?? "Unknown",
    sourceType: row.sourcePlanId ? "plan" : "workout",
    status: "published",
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
        eq(assignments.status, "published"),
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
    status: "published",
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
