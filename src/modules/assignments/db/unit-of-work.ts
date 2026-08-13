import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { exercises } from "@/modules/exercises/db/schema";
import type {
  AssignmentTransaction,
  AssignmentUnitOfWork,
} from "@/modules/assignments/application/assignment-service";
import type { AssignmentSourceInput } from "@/modules/assignments/application/assignment-input";
import {
  assignments,
  assignmentPlanSlotSnapshots,
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentTargets,
  assignmentWorkoutBlockSnapshots,
  assignmentWorkoutItemSnapshots,
  assignmentWorkoutSnapshots,
} from "@/modules/assignments/db/schema";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { planScheduleSlots, plans } from "@/modules/plans/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";
import {
  workoutBlocks,
  workoutItems,
  workouts,
} from "@/modules/workouts/db/schema";

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
            recipients,
          ) {
            await databaseTransaction
              .delete(assignmentRecipients)
              .where(
                and(
                  eq(assignmentRecipients.organizationId, organizationId),
                  eq(assignmentRecipients.assignmentId, assignmentId),
                ),
              );

            if (recipients.length === 0) {
              return;
            }

            const insertedRecipients = await databaseTransaction
              .insert(assignmentRecipients)
              .values(
                recipients.map(({ athleteUserId }) => ({
                  organizationId,
                  assignmentId,
                  athleteUserId,
                })),
              )
              .returning({
                id: assignmentRecipients.id,
                athleteUserId: assignmentRecipients.athleteUserId,
              });
            const teamIdsByAthlete = new Map(
              recipients.map((recipient) => [
                recipient.athleteUserId,
                recipient.teamIds,
              ]),
            );
            const teamScopes = insertedRecipients.flatMap((recipient) =>
              (teamIdsByAthlete.get(recipient.athleteUserId) ?? []).map(
                (teamId) => ({
                  organizationId,
                  assignmentId,
                  recipientId: recipient.id,
                  teamId,
                }),
              ),
            );

            if (teamScopes.length > 0) {
              await databaseTransaction
                .insert(assignmentRecipientTeamScopes)
                .values(teamScopes);
            }
          },
          async snapshotAssignmentSource(organizationId, assignmentId, source) {
            let snapshotCount = 0;
            const workoutSources =
              source.sourceType === "workout"
                ? [
                    {
                      workoutId: source.sourceWorkoutId,
                      sourcePlanSlotId: null,
                      scheduleType: null,
                      dayOfWeek: null,
                      targetSessionsPerWeek: null,
                      position: 0,
                      label: null,
                    },
                  ]
                : await databaseTransaction
                    .select({
                      workoutId: planScheduleSlots.workoutId,
                      sourcePlanSlotId: planScheduleSlots.id,
                      scheduleType: planScheduleSlots.scheduleType,
                      dayOfWeek: planScheduleSlots.dayOfWeek,
                      targetSessionsPerWeek:
                        planScheduleSlots.targetSessionsPerWeek,
                      position: planScheduleSlots.position,
                      label: planScheduleSlots.label,
                    })
                    .from(planScheduleSlots)
                    .where(
                      and(
                        eq(planScheduleSlots.organizationId, organizationId),
                        eq(planScheduleSlots.planId, source.sourcePlanId),
                      ),
                    )
                    .orderBy(asc(planScheduleSlots.position));

            for (const workoutSource of workoutSources) {
              const [sourceWorkout] = await databaseTransaction
                .select({
                  id: workouts.id,
                  name: workouts.name,
                  description: workouts.description,
                  version: workouts.version,
                })
                .from(workouts)
                .where(
                  and(
                    eq(workouts.organizationId, organizationId),
                    eq(workouts.id, workoutSource.workoutId),
                  ),
                )
                .limit(1);

              if (!sourceWorkout) {
                continue;
              }

              const [workoutSnapshot] = await databaseTransaction
                .insert(assignmentWorkoutSnapshots)
                .values({
                  organizationId,
                  assignmentId,
                  sourceWorkoutId: sourceWorkout.id,
                  sourceWorkoutVersion: sourceWorkout.version,
                  name: sourceWorkout.name,
                  description: sourceWorkout.description,
                  position: workoutSource.position,
                })
                .returning({ id: assignmentWorkoutSnapshots.id });

              if (!workoutSnapshot) {
                throw new Error("Failed to create assignment workout snapshot");
              }
              snapshotCount += 1;

              const sourceBlocks = await databaseTransaction
                .select()
                .from(workoutBlocks)
                .where(
                  and(
                    eq(workoutBlocks.organizationId, organizationId),
                    eq(workoutBlocks.workoutId, sourceWorkout.id),
                  ),
                )
                .orderBy(asc(workoutBlocks.position));

              for (const sourceBlock of sourceBlocks) {
                const [blockSnapshot] = await databaseTransaction
                  .insert(assignmentWorkoutBlockSnapshots)
                  .values({
                    organizationId,
                    assignmentId,
                    workoutSnapshotId: workoutSnapshot.id,
                    sourceBlockId: sourceBlock.id,
                    type: sourceBlock.type,
                    label: sourceBlock.label,
                    rounds: sourceBlock.rounds,
                    position: sourceBlock.position,
                  })
                  .returning({ id: assignmentWorkoutBlockSnapshots.id });

                if (!blockSnapshot) {
                  throw new Error(
                    "Failed to create assignment workout block snapshot",
                  );
                }

                const sourceItems = await databaseTransaction
                  .select({
                    id: workoutItems.id,
                    exerciseId: workoutItems.exerciseId,
                    position: workoutItems.position,
                    reps: workoutItems.reps,
                    load: workoutItems.load,
                    loadValue: workoutItems.loadValue,
                    loadUnit: workoutItems.loadUnit,
                    normalizedLoadKg: workoutItems.normalizedLoadKg,
                    durationSeconds: workoutItems.durationSeconds,
                    distanceMeters: workoutItems.distanceMeters,
                    restSeconds: workoutItems.restSeconds,
                    tempo: workoutItems.tempo,
                    notes: workoutItems.notes,
                    exerciseName: exercises.name,
                    exerciseInstructions: exercises.instructions,
                    exerciseCategory: exercises.category,
                    exerciseEquipment: exercises.equipment,
                    exerciseVideoUrl: exercises.videoUrl,
                  })
                  .from(workoutItems)
                  .innerJoin(
                    exercises,
                    and(
                      eq(exercises.organizationId, workoutItems.organizationId),
                      eq(exercises.id, workoutItems.exerciseId),
                    ),
                  )
                  .where(
                    and(
                      eq(workoutItems.organizationId, organizationId),
                      eq(workoutItems.workoutId, sourceWorkout.id),
                      eq(workoutItems.blockId, sourceBlock.id),
                    ),
                  )
                  .orderBy(asc(workoutItems.position));

                if (sourceItems.length > 0) {
                  await databaseTransaction
                    .insert(assignmentWorkoutItemSnapshots)
                    .values(
                      sourceItems.map((sourceItem) => ({
                        organizationId,
                        assignmentId,
                        blockSnapshotId: blockSnapshot.id,
                        sourceItemId: sourceItem.id,
                        sourceExerciseId: sourceItem.exerciseId,
                        exerciseName: sourceItem.exerciseName,
                        exerciseInstructions: sourceItem.exerciseInstructions,
                        exerciseCategory: sourceItem.exerciseCategory,
                        exerciseEquipment: sourceItem.exerciseEquipment,
                        exerciseVideoUrl: sourceItem.exerciseVideoUrl,
                        position: sourceItem.position,
                        reps: sourceItem.reps,
                        load: sourceItem.load,
                        loadValue: sourceItem.loadValue,
                        loadUnit: sourceItem.loadUnit,
                        normalizedLoadKg: sourceItem.normalizedLoadKg,
                        durationSeconds: sourceItem.durationSeconds,
                        distanceMeters: sourceItem.distanceMeters,
                        restSeconds: sourceItem.restSeconds,
                        tempo: sourceItem.tempo,
                        notes: sourceItem.notes,
                      })),
                    );
                }
              }

              if (
                workoutSource.sourcePlanSlotId &&
                workoutSource.scheduleType
              ) {
                await databaseTransaction
                  .insert(assignmentPlanSlotSnapshots)
                  .values({
                    organizationId,
                    assignmentId,
                    sourcePlanSlotId: workoutSource.sourcePlanSlotId,
                    workoutSnapshotId: workoutSnapshot.id,
                    scheduleType: workoutSource.scheduleType,
                    dayOfWeek: workoutSource.dayOfWeek,
                    targetSessionsPerWeek: workoutSource.targetSessionsPerWeek,
                    position: workoutSource.position,
                    label: workoutSource.label,
                  });
              }
            }

            return snapshotCount;
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
