import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  AthletePrescriptionTransaction,
  AthletePrescriptionUnitOfWork,
} from "@/modules/assignments/application/athlete-prescription-service";
import {
  assignments,
  assignmentAthleteItemOverrides,
  assignmentPlanSlotSnapshots,
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentWorkoutItemSnapshots,
} from "@/modules/assignments/db/schema";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";

export function createAthletePrescriptionUnitOfWork(
  database: Database,
): AthletePrescriptionUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: AthletePrescriptionTransaction = {
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
          async findOverrideTarget(input) {
            const [target] = await databaseTransaction
              .select({
                assignmentStatus: assignments.status,
                recipientId: assignmentRecipients.id,
                athleteUserId: assignmentRecipients.athleteUserId,
              })
              .from(assignmentRecipients)
              .innerJoin(
                assignments,
                and(
                  eq(
                    assignments.organizationId,
                    assignmentRecipients.organizationId,
                  ),
                  eq(assignments.id, assignmentRecipients.assignmentId),
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
                  eq(assignmentWorkoutItemSnapshots.id, input.itemSnapshotId),
                ),
              )
              .where(
                and(
                  eq(assignmentRecipients.organizationId, input.organizationId),
                  eq(assignmentRecipients.assignmentId, input.assignmentId),
                  eq(assignmentRecipients.id, input.recipientId),
                  eq(assignmentRecipients.athleteUserId, input.athleteUserId),
                ),
              )
              .limit(1);

            if (!target) return null;
            if (input.planSlotSnapshotId) {
              const [slot] = await databaseTransaction
                .select({ id: assignmentPlanSlotSnapshots.id })
                .from(assignmentPlanSlotSnapshots)
                .where(
                  and(
                    eq(
                      assignmentPlanSlotSnapshots.organizationId,
                      input.organizationId,
                    ),
                    eq(
                      assignmentPlanSlotSnapshots.assignmentId,
                      input.assignmentId,
                    ),
                    eq(
                      assignmentPlanSlotSnapshots.id,
                      input.planSlotSnapshotId,
                    ),
                  ),
                )
                .limit(1);
              if (!slot) return null;
            }

            return target;
          },
          async recipientHasManagedTeamScope(input) {
            if (input.managedTeamIds.length === 0) return false;
            const [scope] = await databaseTransaction
              .select({
                recipientId: assignmentRecipientTeamScopes.recipientId,
              })
              .from(assignmentRecipientTeamScopes)
              .where(
                and(
                  eq(
                    assignmentRecipientTeamScopes.organizationId,
                    input.organizationId,
                  ),
                  eq(
                    assignmentRecipientTeamScopes.assignmentId,
                    input.assignmentId,
                  ),
                  eq(
                    assignmentRecipientTeamScopes.recipientId,
                    input.recipientId,
                  ),
                  inArray(
                    assignmentRecipientTeamScopes.teamId,
                    input.managedTeamIds,
                  ),
                ),
              )
              .limit(1);
            return scope !== undefined;
          },
          async findOverride(input) {
            const [override] = await databaseTransaction
              .select({
                id: assignmentAthleteItemOverrides.id,
                version: assignmentAthleteItemOverrides.version,
              })
              .from(assignmentAthleteItemOverrides)
              .where(
                and(
                  eq(
                    assignmentAthleteItemOverrides.organizationId,
                    input.organizationId,
                  ),
                  eq(
                    assignmentAthleteItemOverrides.assignmentId,
                    input.assignmentId,
                  ),
                  eq(
                    assignmentAthleteItemOverrides.recipientId,
                    input.recipientId,
                  ),
                  eq(
                    assignmentAthleteItemOverrides.itemSnapshotId,
                    input.itemSnapshotId,
                  ),
                  input.planSlotSnapshotId
                    ? eq(
                        assignmentAthleteItemOverrides.planSlotSnapshotId,
                        input.planSlotSnapshotId,
                      )
                    : isNull(assignmentAthleteItemOverrides.planSlotSnapshotId),
                ),
              )
              .limit(1);
            return override ?? null;
          },
          async createOverride(input) {
            const [override] = await databaseTransaction
              .insert(assignmentAthleteItemOverrides)
              .values({
                organizationId: input.organizationId,
                assignmentId: input.assignmentId,
                recipientId: input.recipientId,
                athleteUserId: input.athleteUserId,
                itemSnapshotId: input.itemSnapshotId,
                planSlotSnapshotId: input.planSlotSnapshotId,
                overriddenFields: [...input.overriddenFields],
                reps: input.reps,
                load: input.load,
                loadValue: input.loadValue,
                loadUnit: input.loadUnit,
                normalizedLoadKg: input.normalizedLoadKg,
                durationSeconds: input.durationSeconds,
                distanceMeters: input.distanceMeters,
                restSeconds: input.restSeconds,
                tempo: input.tempo,
                notes: input.notes,
                reason: input.reason,
                createdByUserId: input.actorUserId,
                updatedByUserId: input.actorUserId,
              })
              .returning({
                id: assignmentAthleteItemOverrides.id,
                version: assignmentAthleteItemOverrides.version,
              });
            if (!override)
              throw new Error("Failed to create prescription override");
            return override;
          },
          async updateOverride(input) {
            const [override] = await databaseTransaction
              .update(assignmentAthleteItemOverrides)
              .set({
                overriddenFields: [...input.overriddenFields],
                reps: input.reps,
                load: input.load,
                loadValue: input.loadValue,
                loadUnit: input.loadUnit,
                normalizedLoadKg: input.normalizedLoadKg,
                durationSeconds: input.durationSeconds,
                distanceMeters: input.distanceMeters,
                restSeconds: input.restSeconds,
                tempo: input.tempo,
                notes: input.notes,
                reason: input.reason,
                updatedByUserId: input.actorUserId,
                updatedAt: new Date(),
                version: sql`${assignmentAthleteItemOverrides.version} + 1`,
              })
              .where(
                and(
                  eq(assignmentAthleteItemOverrides.id, input.overrideId),
                  eq(
                    assignmentAthleteItemOverrides.organizationId,
                    input.organizationId,
                  ),
                  eq(
                    assignmentAthleteItemOverrides.assignmentId,
                    input.assignmentId,
                  ),
                  eq(
                    assignmentAthleteItemOverrides.version,
                    input.expectedVersion!,
                  ),
                ),
              )
              .returning({
                id: assignmentAthleteItemOverrides.id,
                version: assignmentAthleteItemOverrides.version,
              });
            return override ?? null;
          },
          async deleteOverride(input) {
            const [deleted] = await databaseTransaction
              .delete(assignmentAthleteItemOverrides)
              .where(
                and(
                  eq(assignmentAthleteItemOverrides.id, input.overrideId),
                  eq(
                    assignmentAthleteItemOverrides.organizationId,
                    input.organizationId,
                  ),
                  eq(
                    assignmentAthleteItemOverrides.assignmentId,
                    input.assignmentId,
                  ),
                  eq(
                    assignmentAthleteItemOverrides.version,
                    input.expectedVersion,
                  ),
                ),
              )
              .returning({ id: assignmentAthleteItemOverrides.id });
            return deleted !== undefined;
          },
        };

        return operation(transaction);
      }),
  };
}
