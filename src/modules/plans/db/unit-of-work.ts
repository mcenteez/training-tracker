import "server-only";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import type {
  PlanTransaction,
  PlanUnitOfWork,
} from "@/modules/plans/application/plan-service";
import { plans, planScheduleSlots } from "@/modules/plans/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";
import { workouts } from "@/modules/workouts/db/schema";

export function createPlanUnitOfWork(database: Database): PlanUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        async function insertScheduleSlots(
          organizationId: string,
          planId: string,
          scheduleSlots: Parameters<PlanTransaction["replaceScheduleSlots"]>[2],
        ) {
          if (!scheduleSlots.length) return;

          await databaseTransaction.insert(planScheduleSlots).values(
            scheduleSlots.map((slot, position) => ({
              organizationId,
              planId,
              workoutId: slot.workoutId,
              cycleWeek: slot.cycleWeek,
              dayOfWeek: slot.dayOfWeek,
              position,
              label: slot.label,
            })),
          );
        }

        const transaction: PlanTransaction = {
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
            const memberships = await databaseTransaction
              .select({ role: teamMemberships.role })
              .from(teamMemberships)
              .where(
                and(
                  eq(teamMemberships.organizationId, organizationId),
                  eq(teamMemberships.userId, userId),
                ),
              );
            return memberships.map((membership) => membership.role);
          },
          async findPlan(organizationId, planId) {
            const [plan] = await databaseTransaction
              .select()
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
          async unarchivedNameExists(organizationId, name, excludePlanId) {
            const conditions = [
              eq(plans.organizationId, organizationId),
              ne(plans.status, "archived"),
              sql`lower(${plans.name}) = lower(${name})`,
            ];
            if (excludePlanId) {
              conditions.push(ne(plans.id, excludePlanId));
            }

            const [existing] = await databaseTransaction
              .select({ id: plans.id })
              .from(plans)
              .where(and(...conditions))
              .limit(1);

            return existing !== undefined;
          },
          async workoutIdsExist(organizationId, workoutIds) {
            if (!workoutIds.length) return true;
            const found = await databaseTransaction
              .select({ id: workouts.id })
              .from(workouts)
              .where(
                and(
                  eq(workouts.organizationId, organizationId),
                  inArray(workouts.id, [...workoutIds]),
                ),
              );
            return (
              new Set(found.map((workout) => workout.id)).size ===
              new Set(workoutIds).size
            );
          },
          async activeWorkoutIdsExist(organizationId, workoutIds) {
            if (!workoutIds.length) return true;
            const found = await databaseTransaction
              .select({ id: workouts.id })
              .from(workouts)
              .where(
                and(
                  eq(workouts.organizationId, organizationId),
                  eq(workouts.status, "active"),
                  inArray(workouts.id, [...workoutIds]),
                ),
              );
            return (
              new Set(found.map((workout) => workout.id)).size ===
              new Set(workoutIds).size
            );
          },
          async createPlan(input) {
            const [createdPlan] = await databaseTransaction
              .insert(plans)
              .values({
                organizationId: input.organizationId,
                name: input.plan.name,
                description: input.plan.description,
                status: input.status,
                createdByUserId: input.actorUserId,
                updatedByUserId: input.actorUserId,
              })
              .returning();
            if (!createdPlan) throw new Error("Failed to create plan");
            return createdPlan;
          },
          async updatePlan(input) {
            const [updatedPlan] = await databaseTransaction
              .update(plans)
              .set({
                name: input.plan.name,
                description: input.plan.description,
                status: input.status,
                updatedByUserId: input.actorUserId,
                updatedAt: new Date(),
                version: sql`${plans.version} + 1`,
              })
              .where(
                and(
                  eq(plans.organizationId, input.organizationId),
                  eq(plans.id, input.planId),
                  eq(plans.version, input.expectedVersion),
                ),
              )
              .returning();
            return updatedPlan ?? null;
          },
          async replaceScheduleSlots(organizationId, planId, scheduleSlots) {
            await databaseTransaction
              .delete(planScheduleSlots)
              .where(
                and(
                  eq(planScheduleSlots.organizationId, organizationId),
                  eq(planScheduleSlots.planId, planId),
                ),
              );
            await insertScheduleSlots(organizationId, planId, scheduleSlots);
          },
          async copyScheduleSlots(organizationId, sourcePlanId, targetPlanId) {
            const sourceSlots = await databaseTransaction
              .select({
                workoutId: planScheduleSlots.workoutId,
                cycleWeek: planScheduleSlots.cycleWeek,
                dayOfWeek: planScheduleSlots.dayOfWeek,
                label: planScheduleSlots.label,
              })
              .from(planScheduleSlots)
              .where(
                and(
                  eq(planScheduleSlots.organizationId, organizationId),
                  eq(planScheduleSlots.planId, sourcePlanId),
                ),
              )
              .orderBy(asc(planScheduleSlots.position));
            await insertScheduleSlots(
              organizationId,
              targetPlanId,
              sourceSlots,
            );
          },
          async setPlanStatus(input) {
            const [updatedPlan] = await databaseTransaction
              .update(plans)
              .set({
                status: input.status,
                archivedAt: input.status === "archived" ? new Date() : null,
                updatedByUserId: input.actorUserId,
                updatedAt: new Date(),
                version: sql`${plans.version} + 1`,
              })
              .where(
                and(
                  eq(plans.organizationId, input.organizationId),
                  eq(plans.id, input.planId),
                  eq(plans.version, input.expectedVersion),
                ),
              )
              .returning();
            return updatedPlan ?? null;
          },
        };

        return operation(transaction);
      }),
  };
}
