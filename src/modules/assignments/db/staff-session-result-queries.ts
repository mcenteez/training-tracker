import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentSessionEffectiveItemPrescriptions,
  assignmentSessionComments,
  assignmentSessionItemResults,
  assignmentSessions,
  assignmentWorkoutBlockSnapshots,
  assignmentWorkoutItemSnapshots,
  assignmentWorkoutSnapshots,
} from "@/modules/assignments/db/schema";
import { users } from "@/modules/users/db/schema";
import {
  findStaffSessionTrainingLoad,
  type SessionTrainingLoadDetail,
} from "./training-load-queries";

export interface StaffSessionResultRow {
  itemSnapshotId: string;
  exerciseName: string;
  blockLabel: string | null;
  blockPosition: number;
  itemPosition: number;
  roundNumber: number;
  completedAt: Date;
  reps: number | null;
  load: string | null;
  loadValue: string | null;
  loadUnit: "kg" | "lb" | null;
  normalizedLoadKg: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  notes: string | null;
}

export interface StaffSessionCommentRow {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
}

export interface StaffSessionResultDetail {
  id: string;
  assignmentId: string;
  athleteUserId: string;
  athleteName: string;
  athleteEmail: string;
  workoutName: string;
  scheduledDate: string;
  status: "in_progress" | "submitted";
  startedAt: Date | null;
  submittedAt: Date | null;
  durationMinutes: number | null;
  sessionRpe: number | null;
  prescriptions: Array<{
    itemSnapshotId: string;
    exerciseName: string;
    blockLabel: string | null;
    reps: number | null;
    load: string | null;
    loadValue: string | null;
    loadUnit: "kg" | "lb" | null;
    normalizedLoadKg: string | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    restSeconds: number | null;
    tempo: string | null;
    notes: string | null;
  }>;
  results: StaffSessionResultRow[];
  trainingLoad: SessionTrainingLoadDetail | null;
  comments: StaffSessionCommentRow[];
}

export async function findStaffSessionResultDetail(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    assignmentId: string;
    sessionId: string;
    asOf?: Date;
  },
): Promise<StaffSessionResultDetail | null> {
  const [session] = await database
    .select({
      id: assignmentSessions.id,
      assignmentId: assignmentSessions.assignmentId,
      athleteUserId: assignmentSessions.athleteUserId,
      athleteEmail: users.email,
      athleteFullName: users.fullName,
      workoutName: assignmentWorkoutSnapshots.name,
      scheduledDate: assignmentSessions.scheduledDate,
      status: assignmentSessions.status,
      startedAt: assignmentSessions.startedAt,
      submittedAt: assignmentSessions.submittedAt,
      durationMinutes: assignmentSessions.durationMinutes,
      sessionRpe: assignmentSessions.sessionRpe,
    })
    .from(assignmentSessions)
    .innerJoin(
      assignmentRecipientTeamScopes,
      and(
        eq(
          assignmentRecipientTeamScopes.organizationId,
          assignmentSessions.organizationId,
        ),
        eq(
          assignmentRecipientTeamScopes.assignmentId,
          assignmentSessions.assignmentId,
        ),
        eq(
          assignmentRecipientTeamScopes.recipientId,
          assignmentSessions.recipientId,
        ),
      ),
    )
    .innerJoin(
      assignmentRecipients,
      and(
        eq(
          assignmentRecipients.organizationId,
          assignmentSessions.organizationId,
        ),
        eq(assignmentRecipients.assignmentId, assignmentSessions.assignmentId),
        eq(assignmentRecipients.id, assignmentSessions.recipientId),
      ),
    )
    .innerJoin(users, eq(users.id, assignmentRecipients.athleteUserId))
    .innerJoin(
      assignmentWorkoutSnapshots,
      and(
        eq(
          assignmentWorkoutSnapshots.organizationId,
          assignmentSessions.organizationId,
        ),
        eq(
          assignmentWorkoutSnapshots.assignmentId,
          assignmentSessions.assignmentId,
        ),
        eq(assignmentWorkoutSnapshots.id, assignmentSessions.workoutSnapshotId),
      ),
    )
    .where(
      and(
        eq(assignmentSessions.organizationId, input.organizationId),
        eq(assignmentSessions.assignmentId, input.assignmentId),
        eq(assignmentSessions.id, input.sessionId),
        sql`${assignmentSessions.status} in ('in_progress', 'submitted')`,
        eq(assignmentRecipientTeamScopes.teamId, input.teamId),
      ),
    )
    .limit(1);

  if (!session) return null;

  const asOf = input.asOf ?? new Date();
  const [prescriptions, results, comments, trainingLoad] = await Promise.all([
    database
      .select({
        itemSnapshotId:
          assignmentSessionEffectiveItemPrescriptions.itemSnapshotId,
        exerciseName: assignmentWorkoutItemSnapshots.exerciseName,
        blockLabel: assignmentWorkoutBlockSnapshots.label,
        blockPosition: assignmentWorkoutBlockSnapshots.position,
        itemPosition: assignmentWorkoutItemSnapshots.position,
        reps: assignmentSessionEffectiveItemPrescriptions.reps,
        load: assignmentSessionEffectiveItemPrescriptions.load,
        loadValue: assignmentSessionEffectiveItemPrescriptions.loadValue,
        loadUnit: assignmentSessionEffectiveItemPrescriptions.loadUnit,
        normalizedLoadKg:
          assignmentSessionEffectiveItemPrescriptions.normalizedLoadKg,
        durationSeconds:
          assignmentSessionEffectiveItemPrescriptions.durationSeconds,
        distanceMeters:
          assignmentSessionEffectiveItemPrescriptions.distanceMeters,
        restSeconds: assignmentSessionEffectiveItemPrescriptions.restSeconds,
        tempo: assignmentSessionEffectiveItemPrescriptions.tempo,
        notes: assignmentSessionEffectiveItemPrescriptions.notes,
      })
      .from(assignmentSessionEffectiveItemPrescriptions)
      .innerJoin(
        assignmentWorkoutItemSnapshots,
        and(
          eq(
            assignmentWorkoutItemSnapshots.organizationId,
            assignmentSessionEffectiveItemPrescriptions.organizationId,
          ),
          eq(
            assignmentWorkoutItemSnapshots.assignmentId,
            assignmentSessionEffectiveItemPrescriptions.assignmentId,
          ),
          eq(
            assignmentWorkoutItemSnapshots.id,
            assignmentSessionEffectiveItemPrescriptions.itemSnapshotId,
          ),
        ),
      )
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
            assignmentSessionEffectiveItemPrescriptions.organizationId,
            input.organizationId,
          ),
          eq(
            assignmentSessionEffectiveItemPrescriptions.assignmentId,
            input.assignmentId,
          ),
          eq(
            assignmentSessionEffectiveItemPrescriptions.sessionId,
            input.sessionId,
          ),
        ),
      )
      .orderBy(
        asc(assignmentWorkoutBlockSnapshots.position),
        asc(assignmentWorkoutItemSnapshots.position),
      ),
    database
      .select({
        itemSnapshotId: assignmentSessionItemResults.itemSnapshotId,
        exerciseName: assignmentWorkoutItemSnapshots.exerciseName,
        blockLabel: assignmentWorkoutBlockSnapshots.label,
        blockPosition: assignmentWorkoutBlockSnapshots.position,
        itemPosition: assignmentWorkoutItemSnapshots.position,
        roundNumber: assignmentSessionItemResults.roundNumber,
        completedAt: assignmentSessionItemResults.completedAt,
        reps: assignmentSessionItemResults.reps,
        load: assignmentSessionItemResults.load,
        loadValue: assignmentSessionItemResults.loadValue,
        loadUnit: assignmentSessionItemResults.loadUnit,
        normalizedLoadKg: assignmentSessionItemResults.normalizedLoadKg,
        durationSeconds: assignmentSessionItemResults.durationSeconds,
        distanceMeters: assignmentSessionItemResults.distanceMeters,
        notes: assignmentSessionItemResults.notes,
      })
      .from(assignmentSessionItemResults)
      .innerJoin(
        assignmentWorkoutItemSnapshots,
        and(
          eq(
            assignmentWorkoutItemSnapshots.organizationId,
            assignmentSessionItemResults.organizationId,
          ),
          eq(
            assignmentWorkoutItemSnapshots.assignmentId,
            assignmentSessionItemResults.assignmentId,
          ),
          eq(
            assignmentWorkoutItemSnapshots.id,
            assignmentSessionItemResults.itemSnapshotId,
          ),
        ),
      )
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
          eq(assignmentSessionItemResults.organizationId, input.organizationId),
          eq(assignmentSessionItemResults.assignmentId, input.assignmentId),
          eq(assignmentSessionItemResults.sessionId, input.sessionId),
        ),
      )
      .orderBy(
        asc(assignmentWorkoutBlockSnapshots.position),
        asc(assignmentWorkoutItemSnapshots.position),
        asc(assignmentSessionItemResults.roundNumber),
      ),
    database
      .select({
        id: assignmentSessionComments.id,
        body: assignmentSessionComments.body,
        createdAt: assignmentSessionComments.createdAt,
        authorFullName: users.fullName,
        authorEmail: users.email,
      })
      .from(assignmentSessionComments)
      .leftJoin(users, eq(users.id, assignmentSessionComments.actorUserId))
      .where(
        and(
          eq(assignmentSessionComments.organizationId, input.organizationId),
          eq(assignmentSessionComments.assignmentId, input.assignmentId),
          eq(assignmentSessionComments.sessionId, input.sessionId),
        ),
      )
      .orderBy(
        asc(assignmentSessionComments.createdAt),
        asc(assignmentSessionComments.id),
      ),
    session.status === "submitted"
      ? findStaffSessionTrainingLoad(database, {
          organizationId: input.organizationId,
          teamId: input.teamId,
          assignmentId: input.assignmentId,
          sessionId: input.sessionId,
          asOf,
        })
      : Promise.resolve(null),
  ]);

  return {
    id: session.id,
    assignmentId: session.assignmentId,
    athleteUserId: session.athleteUserId,
    athleteName: session.athleteFullName?.trim() || session.athleteEmail,
    athleteEmail: session.athleteEmail,
    workoutName: session.workoutName,
    scheduledDate: session.scheduledDate,
    status: session.status as "in_progress" | "submitted",
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    durationMinutes: session.durationMinutes,
    sessionRpe: session.sessionRpe,
    prescriptions,
    results,
    trainingLoad,
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      authorName:
        comment.authorFullName?.trim() ||
        comment.authorEmail ||
        "Former staff member",
    })),
  };
}
