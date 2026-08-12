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
  buildComplianceSummary,
  type ComplianceSummary,
} from "@/modules/assignments/application/compliance-summary";
import {
  assignments,
  assignmentPlanSlotSnapshots,
  assignmentRecipients,
  assignmentRecipientTeamScopes,
  assignmentSessions,
  assignmentWorkoutSnapshots,
} from "@/modules/assignments/db/schema";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { plans } from "@/modules/plans/db/schema";
import { users } from "@/modules/users/db/schema";
import { teamMemberships, teams } from "@/modules/teams/db/schema";
import { workouts } from "@/modules/workouts/db/schema";

interface TeamComplianceData {
  assignments: TeamComplianceAssignmentInput[];
  recipients: TeamComplianceRecipientInput[];
  slots: TeamComplianceSlotInput[];
  sessions: TeamComplianceSessionInput[];
}

export interface TeamComplianceDashboard {
  assignments: TeamAssignmentCompliance[];
  summary: ComplianceSummary;
  rosteredAthleteIds: string[];
}

export interface OrganizationTeamComplianceSummary {
  teamId: string;
  teamName: string;
  summary: ComplianceSummary;
}

export interface OrganizationComplianceDashboard {
  summary: ComplianceSummary;
  teams: OrganizationTeamComplianceSummary[];
}

function buildAssignments(
  data: TeamComplianceData,
  input: { now: Date; windowDays?: number | null },
): TeamAssignmentCompliance[] {
  return data.assignments
    .map((assignment) =>
      buildTeamAssignmentCompliance({
        assignment,
        recipients: data.recipients.filter(
          (recipient) => recipient.assignmentId === assignment.id,
        ),
        slots: data.slots.filter((slot) => slot.assignmentId === assignment.id),
        sessions: data.sessions.filter(
          (session) => session.assignmentId === assignment.id,
        ),
        now: input.now,
        windowDays: input.windowDays,
      }),
    )
    .filter(
      (assignment) =>
        assignment.summary.eligibleDue + assignment.summary.counts.upcoming > 0,
    )
    .sort((left, right) => {
      const attentionDifference =
        right.summary.athletesNeedingAttention -
        left.summary.athletesNeedingAttention;
      if (attentionDifference !== 0) return attentionDifference;

      const overdueDifference =
        right.summary.counts.overdue - left.summary.counts.overdue;
      if (overdueDifference !== 0) return overdueDifference;

      const leftDueNow =
        left.summary.counts.started + left.summary.counts.dueToday;
      const rightDueNow =
        right.summary.counts.started + right.summary.counts.dueToday;
      if (rightDueNow !== leftDueNow) return rightDueNow - leftDueNow;

      const upcomingDifference =
        right.summary.counts.upcoming - left.summary.counts.upcoming;
      if (upcomingDifference !== 0) return upcomingDifference;

      return left.sourceName.localeCompare(right.sourceName);
    });
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

  return buildAssignments(data, { now, windowDays: input.windowDays });
}

export async function getTeamComplianceDashboard(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    windowDays?: number | null;
    now?: Date;
  },
): Promise<TeamComplianceDashboard> {
  const [data, rosterRows] = await Promise.all([
    loadTeamComplianceData(database, input),
    database
      .select({ athleteUserId: teamMemberships.userId })
      .from(teamMemberships)
      .where(
        and(
          eq(teamMemberships.organizationId, input.organizationId),
          eq(teamMemberships.teamId, input.teamId),
          eq(teamMemberships.role, "athlete"),
        ),
      ),
  ]);
  const assignments = buildAssignments(data, {
    now: input.now ?? new Date(),
    windowDays: input.windowDays,
  });
  const rosteredAthleteIds = rosterRows.map((row) => row.athleteUserId);

  return {
    assignments,
    summary: buildComplianceSummary({
      athletes: assignments.flatMap((assignment) =>
        assignment.recipients.map((recipient) => ({
          athleteUserId: recipient.athleteUserId,
          counts: recipient.summary.counts,
          overdueDates: recipient.occurrences
            .filter((occurrence) => occurrence.status === "missed")
            .map((occurrence) => occurrence.scheduledDate),
        })),
      ),
      rosteredAthleteIds,
    }),
    rosteredAthleteIds,
  };
}

export async function getOrganizationComplianceDashboard(
  database: Database,
  input: {
    organizationId: string;
    windowDays?: number | null;
    now?: Date;
  },
): Promise<OrganizationComplianceDashboard> {
  const [assignmentRows, teamRows, scopeRows, rosterRows, teamRosterRows] =
    await Promise.all([
      database
        .select({
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
        .from(assignments)
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
            eq(assignments.organizationId, input.organizationId),
            ne(assignments.status, "draft"),
          ),
        )
        .orderBy(asc(assignments.publishedAt), asc(assignments.id)),
      database
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(eq(teams.organizationId, input.organizationId))
        .orderBy(asc(teams.name)),
      database
        .select({
          assignmentId: assignmentRecipientTeamScopes.assignmentId,
          recipientId: assignmentRecipientTeamScopes.recipientId,
          teamId: assignmentRecipientTeamScopes.teamId,
        })
        .from(assignmentRecipientTeamScopes)
        .where(
          eq(
            assignmentRecipientTeamScopes.organizationId,
            input.organizationId,
          ),
        ),
      database
        .select({ athleteUserId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, input.organizationId),
            eq(organizationMemberships.role, "athlete"),
          ),
        ),
      database
        .select({
          teamId: teamMemberships.teamId,
          athleteUserId: teamMemberships.userId,
        })
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.organizationId, input.organizationId),
            eq(teamMemberships.role, "athlete"),
          ),
        ),
    ]);
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
  const assignmentIds = complianceAssignments.map(
    (assignment) => assignment.id,
  );

  if (assignmentIds.length === 0) {
    return {
      summary: buildComplianceSummary({
        athletes: [],
        rosteredAthleteIds: rosterRows.map((row) => row.athleteUserId),
      }),
      teams: teamRows.map((team) => ({
        teamId: team.id,
        teamName: team.name,
        summary: buildComplianceSummary({
          athletes: [],
          rosteredAthleteIds: teamRosterRows
            .filter((row) => row.teamId === team.id)
            .map((row) => row.athleteUserId),
        }),
      })),
    };
  }

  const recipients = await database
    .select({
      id: assignmentRecipients.id,
      assignmentId: assignmentRecipients.assignmentId,
      athleteUserId: assignmentRecipients.athleteUserId,
      fullName: users.fullName,
      email: users.email,
    })
    .from(assignmentRecipients)
    .innerJoin(users, eq(users.id, assignmentRecipients.athleteUserId))
    .where(
      and(
        eq(assignmentRecipients.organizationId, input.organizationId),
        inArray(assignmentRecipients.assignmentId, assignmentIds),
      ),
    )
    .orderBy(asc(users.email));
  const recipientIds = recipients.map((recipient) => recipient.id);
  const [sessions, slots] = await Promise.all([
    recipientIds.length === 0
      ? Promise.resolve([])
      : database
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
          ),
    database
      .select({
        id: assignmentPlanSlotSnapshots.id,
        assignmentId: assignmentPlanSlotSnapshots.assignmentId,
        workoutSnapshotId: assignmentPlanSlotSnapshots.workoutSnapshotId,
        workoutName: assignmentWorkoutSnapshots.name,
        scheduleType: assignmentPlanSlotSnapshots.scheduleType,
        dayOfWeek: assignmentPlanSlotSnapshots.dayOfWeek,
        targetSessionsPerWeek:
          assignmentPlanSlotSnapshots.targetSessionsPerWeek,
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
      ),
  ]);
  const data = {
    assignments: complianceAssignments,
    recipients,
    sessions,
    slots,
  };
  const now = input.now ?? new Date();
  const organizationAssignments = buildAssignments(data, {
    now,
    windowDays: input.windowDays,
  });
  const summarize = (
    assignmentsToSummarize: TeamAssignmentCompliance[],
    rosteredAthleteIds: string[],
  ) =>
    buildComplianceSummary({
      athletes: assignmentsToSummarize.flatMap((assignment) =>
        assignment.recipients.map((recipient) => ({
          athleteUserId: recipient.athleteUserId,
          counts: recipient.summary.counts,
          overdueDates: recipient.occurrences
            .filter((occurrence) => occurrence.status === "missed")
            .map((occurrence) => occurrence.scheduledDate),
        })),
      ),
      rosteredAthleteIds,
    });

  return {
    summary: summarize(
      organizationAssignments,
      rosterRows.map((row) => row.athleteUserId),
    ),
    teams: teamRows.map((team) => {
      const teamRecipientIds = new Set(
        scopeRows
          .filter((scope) => scope.teamId === team.id)
          .map((scope) => scope.recipientId),
      );
      const teamAssignments = buildAssignments(
        {
          ...data,
          recipients: recipients.filter((recipient) =>
            teamRecipientIds.has(recipient.id),
          ),
          sessions: sessions.filter((session) =>
            teamRecipientIds.has(session.recipientId),
          ),
        },
        { now, windowDays: input.windowDays },
      );

      return {
        teamId: team.id,
        teamName: team.name,
        summary: summarize(
          teamAssignments,
          teamRosterRows
            .filter((row) => row.teamId === team.id)
            .map((row) => row.athleteUserId),
        ),
      };
    }),
  };
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
