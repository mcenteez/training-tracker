import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  ExerciseTransaction,
  ExerciseUnitOfWork,
} from "@/modules/exercises/application/exercise-service";
import { exercises } from "@/modules/exercises/db/schema";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";

export function createExerciseUnitOfWork(
  database: Database,
): ExerciseUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: ExerciseTransaction = {
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
          async activeNameExists(organizationId, name, excludeExerciseId) {
            const conditions = [
              eq(exercises.organizationId, organizationId),
              eq(exercises.status, "active"),
              sql`lower(${exercises.name}) = lower(${name})`,
            ];

            if (excludeExerciseId) {
              conditions.push(ne(exercises.id, excludeExerciseId));
            }

            const [exercise] = await databaseTransaction
              .select({ id: exercises.id })
              .from(exercises)
              .where(and(...conditions))
              .limit(1);

            return exercise !== undefined;
          },
          async findExercise(organizationId, exerciseId) {
            const [exercise] = await databaseTransaction
              .select()
              .from(exercises)
              .where(
                and(
                  eq(exercises.organizationId, organizationId),
                  eq(exercises.id, exerciseId),
                ),
              )
              .limit(1);

            return exercise ?? null;
          },
          async createExercise(input) {
            const [exercise] = await databaseTransaction
              .insert(exercises)
              .values({
                organizationId: input.organizationId,
                ...input.exercise,
                createdByUserId: input.actorUserId,
                updatedByUserId: input.actorUserId,
              })
              .returning();

            if (!exercise) {
              throw new Error("Failed to create exercise");
            }

            return exercise;
          },
          async updateExercise(input) {
            const [exercise] = await databaseTransaction
              .update(exercises)
              .set({
                ...input.exercise,
                updatedByUserId: input.actorUserId,
                updatedAt: new Date(),
                version: sql`${exercises.version} + 1`,
              })
              .where(
                and(
                  eq(exercises.organizationId, input.organizationId),
                  eq(exercises.id, input.exerciseId),
                  eq(exercises.version, input.expectedVersion),
                ),
              )
              .returning();

            return exercise ?? null;
          },
          async setExerciseStatus(input) {
            const [exercise] = await databaseTransaction
              .update(exercises)
              .set({
                status: input.status,
                archivedAt: input.status === "archived" ? new Date() : null,
                updatedByUserId: input.actorUserId,
                updatedAt: new Date(),
                version: sql`${exercises.version} + 1`,
              })
              .where(
                and(
                  eq(exercises.organizationId, input.organizationId),
                  eq(exercises.id, input.exerciseId),
                  eq(exercises.version, input.expectedVersion),
                ),
              )
              .returning();

            return exercise ?? null;
          },
        };

        return operation(transaction);
      }),
  };
}
