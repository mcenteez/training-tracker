import "server-only";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { exercises } from "@/modules/exercises/db/schema";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";
import {
  resistanceFromPersistence,
  resistanceToPersistence,
} from "@/modules/resistance/application/resistance";
import type {
  WorkoutTransaction,
  WorkoutUnitOfWork,
} from "@/modules/workouts/application/workout-service";
import { workoutBlocks, workoutItems, workouts } from "./schema";

export function createWorkoutUnitOfWork(database: Database): WorkoutUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        async function insertStructure(
          organizationId: string,
          workoutId: string,
          blocks: Parameters<WorkoutTransaction["replaceStructure"]>[2],
        ) {
          for (const [blockPosition, block] of blocks.entries()) {
            const [createdBlock] = await databaseTransaction
              .insert(workoutBlocks)
              .values({
                organizationId,
                workoutId,
                type: block.type,
                label: block.label,
                rounds: block.rounds,
                position: blockPosition,
              })
              .returning({ id: workoutBlocks.id });
            if (!createdBlock)
              throw new Error("Failed to create workout block");

            if (block.items.length) {
              await databaseTransaction.insert(workoutItems).values(
                block.items.map((item, itemPosition) => {
                  const { resistance, ...legacyItem } = item;
                  return {
                    organizationId,
                    workoutId,
                    blockId: createdBlock.id,
                    position: itemPosition,
                    ...legacyItem,
                    ...resistanceToPersistence(resistance ?? null),
                  };
                }),
              );
            }
          }
        }

        const transaction: WorkoutTransaction = {
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
          async findWorkout(organizationId, workoutId) {
            const [workout] = await databaseTransaction
              .select()
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
          async unarchivedNameExists(organizationId, name, excludeWorkoutId) {
            const conditions = [
              eq(workouts.organizationId, organizationId),
              ne(workouts.status, "archived"),
              sql`lower(${workouts.name}) = lower(${name})`,
            ];
            if (excludeWorkoutId) {
              conditions.push(ne(workouts.id, excludeWorkoutId));
            }
            const [workout] = await databaseTransaction
              .select({ id: workouts.id })
              .from(workouts)
              .where(and(...conditions))
              .limit(1);
            return workout !== undefined;
          },
          async activeExerciseIdsExist(organizationId, exerciseIds) {
            if (!exerciseIds.length) return true;
            const found = await databaseTransaction
              .select({ id: exercises.id })
              .from(exercises)
              .where(
                and(
                  eq(exercises.organizationId, organizationId),
                  eq(exercises.status, "active"),
                  inArray(exercises.id, [...exerciseIds]),
                ),
              );
            return (
              new Set(found.map((exercise) => exercise.id)).size ===
              new Set(exerciseIds).size
            );
          },
          async createWorkout(input) {
            const [workout] = await databaseTransaction
              .insert(workouts)
              .values({
                organizationId: input.organizationId,
                sourceWorkoutId: input.sourceWorkoutId,
                name: input.graph.name,
                description: input.graph.description,
                status: input.status,
                createdByUserId: input.actorUserId,
                updatedByUserId: input.actorUserId,
              })
              .returning();
            if (!workout) throw new Error("Failed to create workout");
            return workout;
          },
          async updateWorkout(input) {
            const [workout] = await databaseTransaction
              .update(workouts)
              .set({
                name: input.graph.name,
                description: input.graph.description,
                status: input.status,
                updatedByUserId: input.actorUserId,
                updatedAt: new Date(),
                version: sql`${workouts.version} + 1`,
              })
              .where(
                and(
                  eq(workouts.organizationId, input.organizationId),
                  eq(workouts.id, input.workoutId),
                  eq(workouts.version, input.expectedVersion),
                ),
              )
              .returning();
            return workout ?? null;
          },
          async replaceStructure(organizationId, workoutId, blocks) {
            await databaseTransaction
              .delete(workoutBlocks)
              .where(
                and(
                  eq(workoutBlocks.organizationId, organizationId),
                  eq(workoutBlocks.workoutId, workoutId),
                ),
              );
            await insertStructure(organizationId, workoutId, blocks);
          },
          async copyStructure(
            organizationId,
            sourceWorkoutId,
            targetWorkoutId,
          ) {
            const sourceBlocks = await databaseTransaction
              .select()
              .from(workoutBlocks)
              .where(
                and(
                  eq(workoutBlocks.organizationId, organizationId),
                  eq(workoutBlocks.workoutId, sourceWorkoutId),
                ),
              )
              .orderBy(asc(workoutBlocks.position));
            const sourceItems = await databaseTransaction
              .select()
              .from(workoutItems)
              .where(
                and(
                  eq(workoutItems.organizationId, organizationId),
                  eq(workoutItems.workoutId, sourceWorkoutId),
                ),
              )
              .orderBy(asc(workoutItems.position));
            await insertStructure(
              organizationId,
              targetWorkoutId,
              sourceBlocks.map((block) => ({
                type: block.type,
                label: block.label,
                rounds: block.rounds,
                items: sourceItems
                  .filter((item) => item.blockId === block.id)
                  .map((item) => ({
                    exerciseId: item.exerciseId,
                    reps: item.reps,
                    load: item.load,
                    resistance: resistanceFromPersistence(item),
                    durationSeconds: item.durationSeconds,
                    distanceMeters: item.distanceMeters,
                    restSeconds: item.restSeconds,
                    tempo: item.tempo,
                    notes: item.notes,
                  })),
              })),
            );
          },
          async setWorkoutStatus(input) {
            const [workout] = await databaseTransaction
              .update(workouts)
              .set({
                status: input.status,
                archivedAt: input.status === "archived" ? new Date() : null,
                updatedByUserId: input.actorUserId,
                updatedAt: new Date(),
                version: sql`${workouts.version} + 1`,
              })
              .where(
                and(
                  eq(workouts.organizationId, input.organizationId),
                  eq(workouts.id, input.workoutId),
                  eq(workouts.version, input.expectedVersion),
                ),
              )
              .returning();
            return workout ?? null;
          },
        };

        return operation(transaction);
      }),
  };
}
