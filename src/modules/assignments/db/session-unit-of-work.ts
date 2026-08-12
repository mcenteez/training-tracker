import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { AssignmentSessionItemResult } from "@/modules/assignments/db/schema";
import {
  assignments,
  assignmentPlanSlotSnapshots,
  assignmentRecipients,
  assignmentSessionItemResults,
  assignmentSessions,
  assignmentWorkoutBlockSnapshots,
  assignmentWorkoutItemSnapshots,
  assignmentWorkoutSnapshots,
} from "@/modules/assignments/db/schema";
import type {
  AssignmentSessionTransaction,
  AssignmentSessionUnitOfWork,
} from "@/modules/assignments/application/assignment-session-service";

export function createAssignmentSessionUnitOfWork(
  database: Database,
): AssignmentSessionUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: AssignmentSessionTransaction = {
          async findRecipientAssignment(
            organizationId,
            assignmentId,
            athleteUserId,
          ) {
            const [assignment] = await databaseTransaction
              .select({
                assignmentId: assignments.id,
                recipientId: assignmentRecipients.id,
                sourceType: sql<"plan" | "workout">`CASE
                  WHEN ${assignments.sourcePlanId} IS NOT NULL THEN 'plan'
                  ELSE 'workout'
                END`,
                status: sql<"published" | "canceled">`${assignments.status}`,
                timezone: assignments.timezone,
                scheduledDate: assignments.scheduledDate,
                startDate: assignments.startDate,
                endDate: assignments.endDate,
                availableFrom: assignments.availableFrom,
                availableUntil: assignments.availableUntil,
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
              .where(
                and(
                  eq(assignmentRecipients.organizationId, organizationId),
                  eq(assignmentRecipients.assignmentId, assignmentId),
                  eq(assignmentRecipients.athleteUserId, athleteUserId),
                ),
              )
              .limit(1);

            return assignment ?? null;
          },
          async findPrimaryWorkoutSnapshot(organizationId, assignmentId) {
            const [snapshot] = await databaseTransaction
              .select({ workoutSnapshotId: assignmentWorkoutSnapshots.id })
              .from(assignmentWorkoutSnapshots)
              .where(
                and(
                  eq(assignmentWorkoutSnapshots.organizationId, organizationId),
                  eq(assignmentWorkoutSnapshots.assignmentId, assignmentId),
                ),
              )
              .orderBy(asc(assignmentWorkoutSnapshots.position))
              .limit(1);

            return snapshot ?? null;
          },
          async listPlanSlotSnapshots(organizationId, assignmentId) {
            return databaseTransaction
              .select({
                id: assignmentPlanSlotSnapshots.id,
                workoutSnapshotId:
                  assignmentPlanSlotSnapshots.workoutSnapshotId,
                scheduleType: assignmentPlanSlotSnapshots.scheduleType,
                dayOfWeek: assignmentPlanSlotSnapshots.dayOfWeek,
                targetSessionsPerWeek:
                  assignmentPlanSlotSnapshots.targetSessionsPerWeek,
              })
              .from(assignmentPlanSlotSnapshots)
              .where(
                and(
                  eq(
                    assignmentPlanSlotSnapshots.organizationId,
                    organizationId,
                  ),
                  eq(assignmentPlanSlotSnapshots.assignmentId, assignmentId),
                ),
              )
              .orderBy(asc(assignmentPlanSlotSnapshots.position));
          },
          async lockPlanSlotForAthlete(input) {
            // Serializes weekly-target checks per slot and athlete within the transaction.
            await databaseTransaction.execute(
              sql`SELECT pg_advisory_xact_lock(
                hashtext(${input.planSlotSnapshotId}::text),
                hashtext(${input.athleteUserId}::text)
              )`,
            );
          },
          async listAthleteSessions(
            organizationId,
            assignmentId,
            athleteUserId,
          ) {
            return databaseTransaction
              .select({
                id: assignmentSessions.id,
                planSlotSnapshotId: assignmentSessions.planSlotSnapshotId,
                workoutSnapshotId: assignmentSessions.workoutSnapshotId,
                scheduledDate: assignmentSessions.scheduledDate,
                status: assignmentSessions.status,
              })
              .from(assignmentSessions)
              .where(
                and(
                  eq(assignmentSessions.organizationId, organizationId),
                  eq(assignmentSessions.assignmentId, assignmentId),
                  eq(assignmentSessions.athleteUserId, athleteUserId),
                ),
              )
              .orderBy(asc(assignmentSessions.scheduledDate));
          },
          async findSessionForAthlete(
            organizationId,
            assignmentId,
            athleteUserId,
          ) {
            const [session] = await databaseTransaction
              .select({
                id: assignmentSessions.id,
                assignmentId: assignmentSessions.assignmentId,
                athleteUserId: assignmentSessions.athleteUserId,
                workoutSnapshotId: assignmentSessions.workoutSnapshotId,
                status: assignmentSessions.status,
                availableFrom: assignmentSessions.availableFrom,
                availableUntil: assignmentSessions.availableUntil,
                version: assignmentSessions.version,
                lastMutationId: assignmentSessions.lastMutationId,
              })
              .from(assignmentSessions)
              .where(
                and(
                  eq(assignmentSessions.organizationId, organizationId),
                  eq(assignmentSessions.assignmentId, assignmentId),
                  eq(assignmentSessions.athleteUserId, athleteUserId),
                ),
              )
              .orderBy(desc(assignmentSessions.createdAt))
              .limit(1);

            return session ?? null;
          },
          async createSession(input) {
            const startedAt = new Date();
            const [session] = await databaseTransaction
              .insert(assignmentSessions)
              .values({
                organizationId: input.organizationId,
                assignmentId: input.assignmentId,
                recipientId: input.recipientId,
                athleteUserId: input.athleteUserId,
                workoutSnapshotId: input.workoutSnapshotId,
                planSlotSnapshotId: input.planSlotSnapshotId,
                scheduledDate: input.scheduledDate,
                availableFrom: input.availableFrom,
                availableUntil: input.availableUntil,
                status: "in_progress",
                startedAt,
              })
              .returning();

            if (!session) {
              throw new Error("Failed to create assignment session");
            }

            return session;
          },
          async findSessionByIdForAthlete(
            organizationId,
            assignmentId,
            sessionId,
            athleteUserId,
          ) {
            const [session] = await databaseTransaction
              .select({
                id: assignmentSessions.id,
                assignmentId: assignmentSessions.assignmentId,
                athleteUserId: assignmentSessions.athleteUserId,
                workoutSnapshotId: assignmentSessions.workoutSnapshotId,
                status: assignmentSessions.status,
                availableFrom: assignmentSessions.availableFrom,
                availableUntil: assignmentSessions.availableUntil,
                version: assignmentSessions.version,
                lastMutationId: assignmentSessions.lastMutationId,
              })
              .from(assignmentSessions)
              .where(
                and(
                  eq(assignmentSessions.organizationId, organizationId),
                  eq(assignmentSessions.assignmentId, assignmentId),
                  eq(assignmentSessions.id, sessionId),
                  eq(assignmentSessions.athleteUserId, athleteUserId),
                ),
              )
              .limit(1);

            return session ?? null;
          },
          async listItemSnapshotIdsForWorkoutSnapshot(input) {
            const rows = await databaseTransaction
              .select({ id: assignmentWorkoutItemSnapshots.id })
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
                  eq(
                    assignmentWorkoutItemSnapshots.organizationId,
                    input.organizationId,
                  ),
                  eq(
                    assignmentWorkoutItemSnapshots.assignmentId,
                    input.assignmentId,
                  ),
                  eq(
                    assignmentWorkoutBlockSnapshots.workoutSnapshotId,
                    input.workoutSnapshotId,
                  ),
                ),
              );

            return rows.map((row) => row.id);
          },
          async replaceSessionResults(input) {
            await databaseTransaction
              .delete(assignmentSessionItemResults)
              .where(
                and(
                  eq(
                    assignmentSessionItemResults.organizationId,
                    input.organizationId,
                  ),
                  eq(
                    assignmentSessionItemResults.assignmentId,
                    input.assignmentId,
                  ),
                  eq(assignmentSessionItemResults.sessionId, input.sessionId),
                ),
              );

            if (input.results.length === 0) {
              return;
            }

            await databaseTransaction
              .insert(assignmentSessionItemResults)
              .values(
                input.results.map((result) => ({
                  organizationId: input.organizationId,
                  assignmentId: input.assignmentId,
                  sessionId: input.sessionId,
                  itemSnapshotId: result.itemSnapshotId,
                  completedAt: result.completedAt,
                  roundNumber: result.roundNumber,
                  reps: result.reps,
                  load: result.load,
                  durationSeconds: result.durationSeconds,
                  distanceMeters: result.distanceMeters,
                  notes: result.notes,
                })),
              );
          },
          async touchSessionProgress(input) {
            const [session] = await databaseTransaction
              .update(assignmentSessions)
              .set({
                status: input.preserveSubmitted ? "submitted" : "in_progress",
                startedAt: sql`coalesce(${assignmentSessions.startedAt}, now())`,
                updatedAt: new Date(),
                version: sql`${assignmentSessions.version} + 1`,
                lastMutationId: input.mutationId,
              })
              .where(
                and(
                  eq(assignmentSessions.organizationId, input.organizationId),
                  eq(assignmentSessions.assignmentId, input.assignmentId),
                  eq(assignmentSessions.id, input.sessionId),
                  eq(assignmentSessions.version, input.expectedVersion),
                ),
              )
              .returning();

            return session ?? null;
          },
          async submitSession(input) {
            const [session] = await databaseTransaction
              .update(assignmentSessions)
              .set({
                status: "submitted",
                submittedAt: new Date(),
                updatedAt: new Date(),
                version: sql`${assignmentSessions.version} + 1`,
              })
              .where(
                and(
                  eq(assignmentSessions.organizationId, input.organizationId),
                  eq(assignmentSessions.assignmentId, input.assignmentId),
                  eq(assignmentSessions.id, input.sessionId),
                  eq(assignmentSessions.version, input.expectedVersion),
                ),
              )
              .returning();

            return session ?? null;
          },
          async listSessionResults(input) {
            const rows = await databaseTransaction
              .select()
              .from(assignmentSessionItemResults)
              .where(
                and(
                  eq(
                    assignmentSessionItemResults.organizationId,
                    input.organizationId,
                  ),
                  eq(
                    assignmentSessionItemResults.assignmentId,
                    input.assignmentId,
                  ),
                  eq(assignmentSessionItemResults.sessionId, input.sessionId),
                ),
              );

            return rows as readonly AssignmentSessionItemResult[];
          },
          async resetSession(input) {
            await databaseTransaction
              .delete(assignmentSessionItemResults)
              .where(
                and(
                  eq(
                    assignmentSessionItemResults.organizationId,
                    input.organizationId,
                  ),
                  eq(
                    assignmentSessionItemResults.assignmentId,
                    input.assignmentId,
                  ),
                  eq(assignmentSessionItemResults.sessionId, input.sessionId),
                ),
              );

            const [session] = await databaseTransaction
              .update(assignmentSessions)
              .set({
                status: "assigned",
                startedAt: null,
                submittedAt: null,
                updatedAt: new Date(),
                version: 1,
                lastMutationId: null,
              })
              .where(
                and(
                  eq(assignmentSessions.organizationId, input.organizationId),
                  eq(assignmentSessions.assignmentId, input.assignmentId),
                  eq(assignmentSessions.id, input.sessionId),
                  eq(assignmentSessions.version, input.expectedVersion),
                ),
              )
              .returning();

            return session ?? null;
          },
        };

        return operation(transaction);
      }),
  };
}
