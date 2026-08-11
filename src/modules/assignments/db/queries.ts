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
