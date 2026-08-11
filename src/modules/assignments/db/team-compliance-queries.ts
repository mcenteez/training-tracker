import "server-only";

import { and, asc, eq, inArray, ne } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  buildTeamAssignmentCompliance,
  type TeamAssignmentCompliance,
  type TeamComplianceAssignmentInput,
  type TeamComplianceRecipientInput,
  type TeamComplianceSessionInput,
  type TeamComplianceSlotInput,
} from "@/modules/assignments/application/team-compliance";
import {
  assignments,
  assignmentPlanSlotSnapshots,
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentSessions,
  assignmentWorkoutSnapshots,
} from "@/modules/assignments/db/schema";
import { plans } from "@/modules/plans/db/schema";
import { users } from "@/modules/users/db/schema";
import { workouts } from "@/modules/workouts/db/schema";

interface TeamComplianceData {
  assignments: TeamComplianceAssignmentInput[];
  recipients: TeamComplianceRecipientInput[];
  slots: TeamComplianceSlotInput[];
  sessions: TeamComplianceSessionInput[];
}

async function loadTeamComplianceData(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    assignmentId?: string;
  },
): Promise<TeamComplianceData> {
  const assignmentRows = await database
    .selectDistinct({
      id: assignments.id,
      sourcePlanId: assignments.sourcePlanId,
      timezone: assignments.timezone,
      status: assignments.status,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
      scheduledDate: assignments.scheduledDate,
      publishedAt: assignments.publishedAt,
      canceledAt: assignments.canceledAt,
      planName: plans.name,
      workoutName: workouts.name,
    })
    .from(assignmentRecipientTeamScopes)
    .innerJoin(
      assignments,
      and(
        eq(
          assignments.organizationId,
          assignmentRecipientTeamScopes.organizationId,
        ),
        eq(assignments.id, assignmentRecipientTeamScopes.assignmentId),
      ),
    )
    .leftJoin(
      plans,
      and(
        eq(plans.organizationId, assignments.organizationId),
        eq(plans.id, assignments.sourcePlanId),
      ),
    )
    .leftJoin(
      workouts,
      and(
        eq(workouts.organizationId, assignments.organizationId),
        eq(workouts.id, assignments.sourceWorkoutId),
      ),
    )
    .where(
      and(
        eq(assignmentRecipientTeamScopes.organizationId, input.organizationId),
        eq(assignmentRecipientTeamScopes.teamId, input.teamId),
        input.assignmentId ? eq(assignments.id, input.assignmentId) : undefined,
        ne(assignments.status, "draft"),
      ),
    )
    .orderBy(asc(assignments.publishedAt), asc(assignments.id));
  const complianceAssignments =
    assignmentRows.map<TeamComplianceAssignmentInput>((assignment) => ({
      id: assignment.id,
      sourceName:
        assignment.planName ?? assignment.workoutName ?? "Archived training",
      sourceType: assignment.sourcePlanId ? "plan" : "workout",
      timezone: assignment.timezone,
      status: assignment.status as "published" | "canceled",
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      scheduledDate: assignment.scheduledDate,
      publishedAt: assignment.publishedAt,
      canceledAt: assignment.canceledAt,
    }));

  if (complianceAssignments.length === 0) {
    return { assignments: [], recipients: [], slots: [], sessions: [] };
  }

  const assignmentIds = complianceAssignments.map(
    (assignment) => assignment.id,
  );
  const recipients = await database
    .selectDistinct({
      id: assignmentRecipients.id,
      assignmentId: assignmentRecipients.assignmentId,
      athleteUserId: assignmentRecipients.athleteUserId,
      fullName: users.fullName,
      email: users.email,
    })
    .from(assignmentRecipientTeamScopes)
    .innerJoin(
      assignmentRecipients,
      and(
        eq(
          assignmentRecipients.organizationId,
          assignmentRecipientTeamScopes.organizationId,
        ),
        eq(
          assignmentRecipients.assignmentId,
          assignmentRecipientTeamScopes.assignmentId,
        ),
        eq(assignmentRecipients.id, assignmentRecipientTeamScopes.recipientId),
      ),
    )
    .innerJoin(users, eq(users.id, assignmentRecipients.athleteUserId))
    .where(
      and(
        eq(assignmentRecipientTeamScopes.organizationId, input.organizationId),
        eq(assignmentRecipientTeamScopes.teamId, input.teamId),
        inArray(assignmentRecipientTeamScopes.assignmentId, assignmentIds),
      ),
    )
    .orderBy(asc(users.email));
  const recipientIds = recipients.map((recipient) => recipient.id);
  const sessions =
    recipientIds.length === 0
      ? []
      : await database
          .select({
            id: assignmentSessions.id,
            assignmentId: assignmentSessions.assignmentId,
            recipientId: assignmentSessions.recipientId,
            workoutSnapshotId: assignmentSessions.workoutSnapshotId,
            workoutName: assignmentWorkoutSnapshots.name,
            planSlotSnapshotId: assignmentSessions.planSlotSnapshotId,
            scheduledDate: assignmentSessions.scheduledDate,
            status: assignmentSessions.status,
            startedAt: assignmentSessions.startedAt,
            submittedAt: assignmentSessions.submittedAt,
            updatedAt: assignmentSessions.updatedAt,
          })
          .from(assignmentSessions)
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
              eq(
                assignmentWorkoutSnapshots.id,
                assignmentSessions.workoutSnapshotId,
              ),
            ),
          )
          .where(
            and(
              eq(assignmentSessions.organizationId, input.organizationId),
              inArray(assignmentSessions.recipientId, recipientIds),
            ),
          )
          .orderBy(asc(assignmentSessions.scheduledDate));
  const slots = await database
    .select({
      id: assignmentPlanSlotSnapshots.id,
      assignmentId: assignmentPlanSlotSnapshots.assignmentId,
      workoutSnapshotId: assignmentPlanSlotSnapshots.workoutSnapshotId,
      workoutName: assignmentWorkoutSnapshots.name,
      scheduleType: assignmentPlanSlotSnapshots.scheduleType,
      dayOfWeek: assignmentPlanSlotSnapshots.dayOfWeek,
      targetSessionsPerWeek: assignmentPlanSlotSnapshots.targetSessionsPerWeek,
      label: assignmentPlanSlotSnapshots.label,
    })
    .from(assignmentPlanSlotSnapshots)
    .innerJoin(
      assignmentWorkoutSnapshots,
      and(
        eq(
          assignmentWorkoutSnapshots.organizationId,
          assignmentPlanSlotSnapshots.organizationId,
        ),
        eq(
          assignmentWorkoutSnapshots.assignmentId,
          assignmentPlanSlotSnapshots.assignmentId,
        ),
        eq(
          assignmentWorkoutSnapshots.id,
          assignmentPlanSlotSnapshots.workoutSnapshotId,
        ),
      ),
    )
    .where(
      and(
        eq(assignmentPlanSlotSnapshots.organizationId, input.organizationId),
        inArray(assignmentPlanSlotSnapshots.assignmentId, assignmentIds),
      ),
    )
    .orderBy(asc(assignmentPlanSlotSnapshots.position));

  return {
    assignments: complianceAssignments,
    recipients,
    sessions,
    slots,
  };
}

export async function listTeamAssignmentCompliance(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    windowDays?: number | null;
    now?: Date;
  },
): Promise<TeamAssignmentCompliance[]> {
  const data = await loadTeamComplianceData(database, input);
  const now = input.now ?? new Date();

  return data.assignments.map((assignment) =>
    buildTeamAssignmentCompliance({
      assignment,
      recipients: data.recipients.filter(
        (recipient) => recipient.assignmentId === assignment.id,
      ),
      slots: data.slots.filter((slot) => slot.assignmentId === assignment.id),
      sessions: data.sessions.filter(
        (session) => session.assignmentId === assignment.id,
      ),
      now,
      windowDays: input.windowDays,
    }),
  );
}

export async function findTeamAssignmentCompliance(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    assignmentId: string;
    windowDays?: number | null;
    now?: Date;
  },
): Promise<TeamAssignmentCompliance | null> {
  const data = await loadTeamComplianceData(database, input);
  const assignment = data.assignments[0];
  if (!assignment) return null;

  return buildTeamAssignmentCompliance({
    assignment,
    recipients: data.recipients,
    slots: data.slots,
    sessions: data.sessions,
    now: input.now ?? new Date(),
    windowDays: input.windowDays,
  });
}
