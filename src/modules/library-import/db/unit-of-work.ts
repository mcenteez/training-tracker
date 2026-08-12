import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";

import type { Database } from "@/db/client";
import { exercises } from "@/modules/exercises/db/schema";
import type {
  LibraryImportTransaction,
  LibraryImportUnitOfWork,
} from "@/modules/library-import/application/import-service";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { plans, planScheduleSlots } from "@/modules/plans/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";
import {
  workoutBlocks,
  workoutItems,
  workouts,
} from "@/modules/workouts/db/schema";

export function createLibraryImportUnitOfWork(
  database: Database,
): LibraryImportUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: LibraryImportTransaction = {
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
          async listActiveExercises(organizationId) {
            return databaseTransaction
              .select({ id: exercises.id, name: exercises.name })
              .from(exercises)
              .where(
                and(
                  eq(exercises.organizationId, organizationId),
                  eq(exercises.status, "active"),
                ),
              )
              .orderBy(asc(exercises.name));
          },
          async listUnarchivedWorkouts(organizationId) {
            return databaseTransaction
              .select({ id: workouts.id, name: workouts.name })
              .from(workouts)
              .where(
                and(
                  eq(workouts.organizationId, organizationId),
                  ne(workouts.status, "archived"),
                ),
              )
              .orderBy(asc(workouts.name));
          },
          async listUnarchivedPlans(organizationId) {
            return databaseTransaction
              .select({ id: plans.id, name: plans.name })
              .from(plans)
              .where(
                and(
                  eq(plans.organizationId, organizationId),
                  ne(plans.status, "archived"),
                ),
              )
              .orderBy(asc(plans.name));
          },
          async createExercises(input) {
            return databaseTransaction
              .insert(exercises)
              .values(
                input.exercises.map((exercise) => ({
                  organizationId: input.organizationId,
                  name: exercise.name,
                  instructions: exercise.instructions,
                  category: exercise.category,
                  equipment: exercise.equipment,
                  videoUrl: exercise.videoUrl,
                  createdByUserId: input.actorUserId,
                  updatedByUserId: input.actorUserId,
                })),
              )
              .returning({ id: exercises.id, name: exercises.name });
          },
          async createWorkout(input) {
            const [createdWorkout] = await databaseTransaction
              .insert(workouts)
              .values({
                organizationId: input.organizationId,
                name: input.workout.name,
                description: input.workout.description,
                status: "draft",
                createdByUserId: input.actorUserId,
                updatedByUserId: input.actorUserId,
              })
              .returning({ id: workouts.id, name: workouts.name });
            if (!createdWorkout) throw new Error("Failed to create workout");

            for (const [
              blockPosition,
              block,
            ] of input.workout.blocks.entries()) {
              const [createdBlock] = await databaseTransaction
                .insert(workoutBlocks)
                .values({
                  organizationId: input.organizationId,
                  workoutId: createdWorkout.id,
                  type: block.type,
                  label: block.label,
                  rounds: block.rounds,
                  position: blockPosition,
                })
                .returning({ id: workoutBlocks.id });
              if (!createdBlock)
                throw new Error("Failed to create workout block");

              if (!block.items.length) continue;

              await databaseTransaction.insert(workoutItems).values(
                block.items.map((item, itemPosition) => ({
                  organizationId: input.organizationId,
                  workoutId: createdWorkout.id,
                  blockId: createdBlock.id,
                  position: itemPosition,
                  ...item,
                })),
              );
            }

            return createdWorkout;
          },
          async createPlan(input) {
            const [createdPlan] = await databaseTransaction
              .insert(plans)
              .values({
                organizationId: input.organizationId,
                name: input.plan.name,
                description: input.plan.description,
                status: "draft",
                createdByUserId: input.actorUserId,
                updatedByUserId: input.actorUserId,
              })
              .returning({ id: plans.id, name: plans.name });
            if (!createdPlan) throw new Error("Failed to create plan");

            if (input.plan.scheduleSlots.length) {
              await databaseTransaction.insert(planScheduleSlots).values(
                input.plan.scheduleSlots.map((slot, position) => ({
                  organizationId: input.organizationId,
                  planId: createdPlan.id,
                  workoutId: slot.workoutId,
                  scheduleType: slot.scheduleType,
                  dayOfWeek:
                    slot.scheduleType === "fixed_day" ? slot.dayOfWeek : null,
                  targetSessionsPerWeek:
                    slot.scheduleType === "weekly_frequency"
                      ? slot.targetSessionsPerWeek
                      : null,
                  position,
                  label: slot.label,
                })),
              );
            }

            return createdPlan;
          },
        };

        return operation(transaction);
      }),
  };
}
