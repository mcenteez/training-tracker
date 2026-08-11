import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentSessionComments,
  assignmentSessionItemResults,
  assignmentSessions,
  assignmentWorkoutBlockSnapshots,
  assignmentWorkoutItemSnapshots,
  assignmentWorkoutSnapshots,
} from "@/modules/assignments/db/schema";
import { users } from "@/modules/users/db/schema";

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
  startedAt: Date | null;
  submittedAt: Date;
  results: StaffSessionResultRow[];
  comments: StaffSessionCommentRow[];
}

export async function findStaffSessionResultDetail(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    assignmentId: string;
    sessionId: string;
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
      startedAt: assignmentSessions.startedAt,
      submittedAt: assignmentSessions.submittedAt,
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
        eq(assignmentSessions.status, "submitted"),
        eq(assignmentRecipientTeamScopes.teamId, input.teamId),
      ),
    )
    .limit(1);

  if (!session?.submittedAt) return null;

  const [results, comments] = await Promise.all([
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
  ]);

  return {
    id: session.id,
    assignmentId: session.assignmentId,
    athleteUserId: session.athleteUserId,
    athleteName: session.athleteFullName?.trim() || session.athleteEmail,
    athleteEmail: session.athleteEmail,
    workoutName: session.workoutName,
    scheduledDate: session.scheduledDate,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    results,
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
