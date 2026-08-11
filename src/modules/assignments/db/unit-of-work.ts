import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  AssignmentTransaction,
  AssignmentUnitOfWork,
} from "@/modules/assignments/application/assignment-service";
import type { AssignmentSourceInput } from "@/modules/assignments/application/assignment-input";
import {
  assignments,
  assignmentRecipients,
  assignmentTargets,
} from "@/modules/assignments/db/schema";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { plans } from "@/modules/plans/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";
import { workouts } from "@/modules/workouts/db/schema";

function toAssignmentSourceValues(source: AssignmentSourceInput) {
  if (source.sourceType === "plan") {
    return {
      sourcePlanId: source.sourcePlanId,
      sourceWorkoutId: null,
      startDate: source.startDate,
      endDate: source.endDate,
      scheduledDate: null,
      availableFrom: null,
      availableUntil: null,
    } as const;
  }

  return {
    sourcePlanId: null,
    sourceWorkoutId: source.sourceWorkoutId,
    startDate: null,
    endDate: null,
    scheduledDate: source.scheduledDate,
    availableFrom: source.availableFrom ? new Date(source.availableFrom) : null,
    availableUntil: source.availableUntil
      ? new Date(source.availableUntil)
      : null,
  } as const;
}

export function createAssignmentUnitOfWork(
  database: Database,
): AssignmentUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: AssignmentTransaction = {
          async findOrganizationRole(organizationId, userId) {
            const [membership] = await databaseTransaction
              .select({ role: organizationMemberships.role })
              .from(organizationMemberships)
              .where(
                and(
                  eq(organizationMemberships.organizationId, organizationId),
                  eq(organizationMemberships.userId, userId),
                ),
              )
              .limit(1);

            return membership?.role ?? null;
          },
          async listTeamRoles(organizationId, userId) {
            return databaseTransaction
              .select({
                teamId: teamMemberships.teamId,
                role: teamMemberships.role,
              })
              .from(teamMemberships)
              .where(
                and(
                  eq(teamMemberships.organizationId, organizationId),
                  eq(teamMemberships.userId, userId),
                ),
              );
          },
          async findAssignment(organizationId, assignmentId) {
            const [assignment] = await databaseTransaction
              .select()
              .from(assignments)
              .where(
                and(
                  eq(assignments.organizationId, organizationId),
                  eq(assignments.id, assignmentId),
                ),
              )
              .limit(1);

            return assignment ?? null;
          },
          async findPlan(organizationId, planId) {
            const [plan] = await databaseTransaction
              .select({ id: plans.id, status: plans.status })
              .from(plans)
              .where(
                and(
                  eq(plans.organizationId, organizationId),
                  eq(plans.id, planId),
                ),
              )
              .limit(1);

            return plan ?? null;
          },
          async findWorkout(organizationId, workoutId) {
            const [workout] = await databaseTransaction
              .select({ id: workouts.id, status: workouts.status })
              .from(workouts)
              .where(
                and(
                  eq(workouts.organizationId, organizationId),
                  eq(workouts.id, workoutId),
                ),
              )
              .limit(1);

            return workout ?? null;
          },
          async createAssignmentDraft(input) {
            const [assignment] = await databaseTransaction
              .insert(assignments)
              .values({
                organizationId: input.organizationId,
                timezone: input.timezone,
                createdByUserId: input.actorUserId,
                updatedByUserId: input.actorUserId,
                ...toAssignmentSourceValues(input.source),
              })
              .returning();

            if (!assignment) {
              throw new Error("Failed to create assignment draft");
            }

            return assignment;
          },
          async updateAssignmentDraft(input) {
            const [assignment] = await databaseTransaction
              .update(assignments)
              .set({
                timezone: input.timezone,
                updatedByUserId: input.actorUserId,
                updatedAt: new Date(),
                version: sql`${assignments.version} + 1`,
                ...toAssignmentSourceValues(input.source),
              })
              .where(
                and(
                  eq(assignments.organizationId, input.organizationId),
                  eq(assignments.id, input.assignmentId),
                  eq(assignments.version, input.expectedVersion),
                ),
              )
              .returning();

            return assignment ?? null;
          },
          async replaceAssignmentTargets(
            organizationId,
            assignmentId,
            targets,
          ) {
            await databaseTransaction
              .delete(assignmentTargets)
              .where(
                and(
                  eq(assignmentTargets.organizationId, organizationId),
                  eq(assignmentTargets.assignmentId, assignmentId),
                ),
              );

            if (targets.length === 0) {
              return;
            }

            await databaseTransaction.insert(assignmentTargets).values(
              targets.map((target) => ({
                organizationId,
                assignmentId,
                targetType: target.targetType,
                teamId: target.targetType === "team" ? target.teamId : null,
                athleteUserId:
                  target.targetType === "athlete" ? target.athleteUserId : null,
              })),
            );
          },
          async listAssignmentTargets(organizationId, assignmentId) {
            return databaseTransaction
              .select({
                id: assignmentTargets.id,
                targetType: assignmentTargets.targetType,
                teamId: assignmentTargets.teamId,
                athleteUserId: assignmentTargets.athleteUserId,
              })
              .from(assignmentTargets)
              .where(
                and(
                  eq(assignmentTargets.organizationId, organizationId),
                  eq(assignmentTargets.assignmentId, assignmentId),
                ),
              );
          },
          async listAthleteUserIdsForTeam(organizationId, teamId) {
            const rows = await databaseTransaction
              .select({ userId: teamMemberships.userId })
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
                  eq(teamMemberships.organizationId, organizationId),
                  eq(teamMemberships.teamId, teamId),
                  eq(organizationMemberships.role, "athlete"),
                ),
              );

            return rows.map((row) => row.userId);
          },
          async listTeamIdsForAthlete(organizationId, athleteUserId) {
            const rows = await databaseTransaction
              .select({ teamId: teamMemberships.teamId })
              .from(teamMemberships)
              .where(
                and(
                  eq(teamMemberships.organizationId, organizationId),
                  eq(teamMemberships.userId, athleteUserId),
                ),
              );

            return rows.map((row) => row.teamId);
          },
          async replaceAssignmentRecipients(
            organizationId,
            assignmentId,
            athleteUserIds,
          ) {
            await databaseTransaction
              .delete(assignmentRecipients)
              .where(
                and(
                  eq(assignmentRecipients.organizationId, organizationId),
                  eq(assignmentRecipients.assignmentId, assignmentId),
                ),
              );

            if (athleteUserIds.length === 0) {
              return;
            }

            await databaseTransaction.insert(assignmentRecipients).values(
              athleteUserIds.map((athleteUserId) => ({
                organizationId,
                assignmentId,
                athleteUserId,
              })),
            );
          },
          async markAssignmentPublished(input) {
            const [assignment] = await databaseTransaction
              .update(assignments)
              .set({
                status: "published",
                publishedAt: new Date(),
                updatedAt: new Date(),
                updatedByUserId: input.actorUserId,
                version: sql`${assignments.version} + 1`,
              })
              .where(
                and(
                  eq(assignments.organizationId, input.organizationId),
                  eq(assignments.id, input.assignmentId),
                  eq(assignments.version, input.expectedVersion),
                ),
              )
              .returning();

            return assignment ?? null;
          },
          async markAssignmentCanceled(input) {
            const [assignment] = await databaseTransaction
              .update(assignments)
              .set({
                status: "canceled",
                canceledAt: new Date(),
                updatedAt: new Date(),
                updatedByUserId: input.actorUserId,
                version: sql`${assignments.version} + 1`,
              })
              .where(
                and(
                  eq(assignments.organizationId, input.organizationId),
                  eq(assignments.id, input.assignmentId),
                  eq(assignments.version, input.expectedVersion),
                ),
              )
              .returning();

            return assignment ?? null;
          },
        };

        return operation(transaction);
      }),
  };
}
