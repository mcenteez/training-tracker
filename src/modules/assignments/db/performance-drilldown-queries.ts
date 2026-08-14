import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import {
  type PerformanceDrilldownMetric,
  type PerformanceDrilldownTab,
} from "@/modules/assignments/application/performance-drilldowns";
import {
  classifyOccurrenceTimeliness,
  type OccurrenceTimelinessState,
} from "@/modules/assignments/application/timeliness-summary";
import { resolveEquivalentMetricWindows } from "@/modules/assignments/application/timeliness-policy";
import {
  getOrganizationComplianceDashboard,
  getTeamComplianceDashboard,
} from "./team-compliance-queries";
import { listTeamTrainingLoadDetails } from "./training-load-queries";
import { users } from "@/modules/users/db/schema";
import { assignmentRecipientTeamScopes } from "@/modules/assignments/db/schema";
import { teams } from "@/modules/teams/db/schema";
import { listOrganizationTrainingLoadDetails } from "./training-load-queries";

export interface TeamComplianceDrilldownFact {
  metric: "compliance";
  athleteName: string;
  athleteEmail: string;
  athleteUserId: string;
  assignmentId: string;
  assignmentName: string;
  assignmentTimezone: string;
  sessionId: string | null;
  scheduledDate: string;
  workoutName: string;
  label: string | null;
  status: "completed" | "overdue" | "started" | "dueToday" | "upcoming";
  dueAt: Date | null;
  submittedAt: Date | null;
}

export interface TeamTimelinessDrilldownFact {
  metric: "timeliness";
  cohort: "current" | "previous";
  athleteName: string;
  athleteEmail: string;
  athleteUserId: string;
  assignmentId: string;
  assignmentName: string;
  assignmentTimezone: string;
  sessionId: string | null;
  scheduledDate: string;
  workoutName: string;
  label: string | null;
  state: OccurrenceTimelinessState;
  dueAt: Date;
  submittedAt: Date | null;
  latenessMilliseconds: number | null;
  overdueMilliseconds: number | null;
}

export interface OrganizationComplianceDrilldownFact extends TeamComplianceDrilldownFact {
  teamId: string | null;
  teamName: string | null;
}

export interface OrganizationTimelinessDrilldownFact extends TeamTimelinessDrilldownFact {
  teamId: string | null;
  teamName: string | null;
}

export interface TeamTrainingLoadDrilldownFact {
  metric: "trainingLoad";
  athleteName: string;
  athleteEmail: string;
  athleteUserId: string;
  assignmentId: string;
  sessionId: string;
  scheduledDate: string;
  durationMinutes: number | null;
  sessionRpe: number | null;
  internalLoad: number | null;
  captureState: "available" | "missingDuration" | "missingRpe" | "missingBoth";
  externalWorkState: "comparable" | "partial" | "unavailable";
  prescribedVolumeKg: number | null;
  completedVolumeKg: number | null;
  completedMeasurableRowCount: number;
  completedRowCount: number;
  unavailableReason: string | null;
}

export interface OrganizationTrainingLoadDrilldownFact extends TeamTrainingLoadDrilldownFact {
  teamId: string | null;
  teamName: string | null;
}

function occurrenceStatusToFactStatus(
  status: "assigned" | "in_progress" | "submitted" | "missed" | "upcoming",
): TeamComplianceDrilldownFact["status"] {
  if (status === "submitted") return "completed";
  if (status === "missed") return "overdue";
  if (status === "in_progress") return "started";
  if (status === "assigned") return "dueToday";
  return "upcoming";
}

export async function listTeamComplianceDrilldownFacts(
  database: Parameters<typeof getTeamComplianceDashboard>[0],
  input: {
    organizationId: string;
    teamId: string;
    metric: Extract<
      PerformanceDrilldownMetric,
      "completion" | "attention" | "overdue" | "dueNow"
    >;
    tab: PerformanceDrilldownTab;
    windowDays: number | null;
    asOf: Date;
  },
): Promise<TeamComplianceDrilldownFact[]> {
  const dashboard = await getTeamComplianceDashboard(database, {
    organizationId: input.organizationId,
    teamId: input.teamId,
    windowDays: input.windowDays,
    now: input.asOf,
  });
  const facts: TeamComplianceDrilldownFact[] = dashboard.assignments.flatMap(
    (assignment) =>
      assignment.recipients.flatMap((recipient) =>
        recipient.occurrences.map((occurrence) => ({
          metric: "compliance" as const,
          athleteName: recipient.fullName?.trim() || recipient.email,
          athleteEmail: recipient.email,
          athleteUserId: recipient.athleteUserId,
          assignmentId: assignment.id,
          assignmentName: assignment.sourceName,
          assignmentTimezone: assignment.timezone,
          sessionId: occurrence.sessionId,
          scheduledDate: occurrence.scheduledDate,
          workoutName: occurrence.workoutName,
          label: occurrence.label,
          status: occurrenceStatusToFactStatus(occurrence.status),
          dueAt: occurrence.dueAt,
          submittedAt: occurrence.submittedAt,
        })),
      ),
  );
  const matchesMetric = (fact: TeamComplianceDrilldownFact) => {
    if (input.metric === "attention" || input.metric === "overdue") {
      return fact.status === "overdue";
    }
    if (input.metric === "dueNow") {
      return fact.status === "started" || fact.status === "dueToday";
    }
    return fact.status !== "upcoming";
  };
  const matchesTab = (fact: TeamComplianceDrilldownFact) => {
    if (input.tab === "all") return true;
    return fact.status === input.tab;
  };
  return facts
    .filter(matchesMetric)
    .filter(matchesTab)
    .toSorted((left, right) => {
      const priority = (fact: TeamComplianceDrilldownFact) =>
        fact.status === "overdue"
          ? 0
          : fact.status === "started"
            ? 1
            : fact.status === "dueToday"
              ? 2
              : fact.status === "completed"
                ? 3
                : 4;
      return (
        priority(left) - priority(right) ||
        left.scheduledDate.localeCompare(right.scheduledDate) ||
        left.athleteName.localeCompare(right.athleteName)
      );
    });
}

export async function listOrganizationComplianceDrilldownFacts(
  database: Parameters<typeof getOrganizationComplianceDashboard>[0],
  input: {
    organizationId: string;
    metric: Extract<
      PerformanceDrilldownMetric,
      "completion" | "attention" | "overdue" | "dueNow"
    >;
    tab: PerformanceDrilldownTab;
    windowDays: number | null;
    asOf: Date;
  },
): Promise<OrganizationComplianceDrilldownFact[]> {
  const dashboard = await getOrganizationComplianceDashboard(database, {
    organizationId: input.organizationId,
    windowDays: input.windowDays,
    now: input.asOf,
  });
  const teamByRecipient = new Map<string, { id: string; name: string }>();
  for (const team of dashboard.teams) {
    for (const assignment of team.timeliness.assignments) {
      for (const athlete of assignment.athletes) {
        teamByRecipient.set(athlete.recipientId, {
          id: team.teamId,
          name: team.teamName,
        });
      }
    }
  }
  const facts: OrganizationComplianceDrilldownFact[] =
    dashboard.assignments.flatMap((assignment) =>
      assignment.recipients.flatMap((recipient) => {
        const team = teamByRecipient.get(recipient.id);
        return recipient.occurrences.map((occurrence) => ({
          metric: "compliance" as const,
          athleteName: recipient.fullName?.trim() || recipient.email,
          athleteEmail: recipient.email,
          athleteUserId: recipient.athleteUserId,
          assignmentId: assignment.id,
          assignmentName: assignment.sourceName,
          assignmentTimezone: assignment.timezone,
          sessionId: occurrence.sessionId,
          scheduledDate: occurrence.scheduledDate,
          workoutName: occurrence.workoutName,
          label: occurrence.label,
          status: occurrenceStatusToFactStatus(occurrence.status),
          dueAt: occurrence.dueAt,
          submittedAt: occurrence.submittedAt,
          teamId: team?.id ?? null,
          teamName: team?.name ?? null,
        }));
      }),
    );
  return facts
    .filter((fact) => {
      if (input.metric === "attention" || input.metric === "overdue") {
        return fact.status === "overdue";
      }
      if (input.metric === "dueNow") {
        return fact.status === "started" || fact.status === "dueToday";
      }
      return fact.status !== "upcoming";
    })
    .filter((fact) => input.tab === "all" || fact.status === input.tab)
    .toSorted(
      (left, right) =>
        (left.teamName ?? "Organization only").localeCompare(
          right.teamName ?? "Organization only",
        ) || left.scheduledDate.localeCompare(right.scheduledDate),
    );
}

export async function listTeamTimelinessDrilldownFacts(
  database: Parameters<typeof getTeamComplianceDashboard>[0],
  input: {
    organizationId: string;
    teamId: string;
    metric: Extract<PerformanceDrilldownMetric, "onTime" | "lateCompleted">;
    tab: PerformanceDrilldownTab;
    windowDays: number | null;
    asOf: Date;
  },
): Promise<TeamTimelinessDrilldownFact[]> {
  const dashboard = await getTeamComplianceDashboard(database, {
    organizationId: input.organizationId,
    teamId: input.teamId,
    windowDays: null,
    now: input.asOf,
  });
  const windows = resolveEquivalentMetricWindows({
    asOf: input.asOf,
    windowDays:
      input.windowDays === 90 ? 90 : input.windowDays === null ? null : 30,
  });
  const currentStart = windows?.current.startAt;
  const previous = windows?.previous ?? null;
  const facts: TeamTimelinessDrilldownFact[] = dashboard.assignments.flatMap(
    (assignment) =>
      assignment.recipients.flatMap((recipient) =>
        recipient.occurrences.flatMap((occurrence) => {
          const classified = classifyOccurrenceTimeliness({
            occurrence: {
              athleteUserId: recipient.athleteUserId,
              dueAt: occurrence.dueAt,
              firstSubmittedAt: occurrence.submittedAt,
              policyEffectiveAt: occurrence.policyEffectiveAt,
            },
            asOf: input.asOf,
          });
          if (!classified) return [];
          const cohort =
            previous &&
            classified.dueAt >= previous.startAt &&
            classified.dueAt < previous.endAt
              ? "previous"
              : currentStart && classified.dueAt < currentStart
                ? null
                : "current";
          if (!cohort) return [];
          return [
            {
              metric: "timeliness" as const,
              cohort,
              athleteName: recipient.fullName?.trim() || recipient.email,
              athleteEmail: recipient.email,
              athleteUserId: recipient.athleteUserId,
              assignmentId: assignment.id,
              assignmentName: assignment.sourceName,
              assignmentTimezone: assignment.timezone,
              sessionId: occurrence.sessionId,
              scheduledDate: occurrence.scheduledDate,
              workoutName: occurrence.workoutName,
              label: occurrence.label,
              state: classified.state,
              dueAt: classified.dueAt,
              submittedAt: classified.firstSubmittedAt,
              latenessMilliseconds: classified.latenessMilliseconds,
              overdueMilliseconds: classified.overdueMilliseconds,
            },
          ];
        }),
      ),
  );
  const matchesTab = (fact: TeamTimelinessDrilldownFact) => {
    if (input.metric === "lateCompleted") return fact.state === "lateCompleted";
    if (input.tab === "all") return true;
    return (
      (input.tab === "onTime" && fact.state === "onTimeCompleted") ||
      (input.tab === "late" && fact.state === "lateCompleted") ||
      (input.tab === "openOverdue" && fact.state === "openOverdue")
    );
  };
  return facts.filter(matchesTab).toSorted((left, right) => {
    const priority = (fact: TeamTimelinessDrilldownFact) =>
      fact.state === "openOverdue" ? 0 : fact.state === "lateCompleted" ? 1 : 2;
    return (
      priority(left) - priority(right) ||
      (right.latenessMilliseconds ?? right.overdueMilliseconds ?? 0) -
        (left.latenessMilliseconds ?? left.overdueMilliseconds ?? 0) ||
      left.scheduledDate.localeCompare(right.scheduledDate)
    );
  });
}

export async function listOrganizationTimelinessDrilldownFacts(
  database: Parameters<typeof getOrganizationComplianceDashboard>[0],
  input: {
    organizationId: string;
    metric: Extract<PerformanceDrilldownMetric, "onTime" | "lateCompleted">;
    tab: PerformanceDrilldownTab;
    windowDays: number | null;
    asOf: Date;
  },
): Promise<OrganizationTimelinessDrilldownFact[]> {
  const dashboard = await getOrganizationComplianceDashboard(database, {
    organizationId: input.organizationId,
    windowDays: null,
    now: input.asOf,
  });
  const windows = resolveEquivalentMetricWindows({
    asOf: input.asOf,
    windowDays:
      input.windowDays === 90 ? 90 : input.windowDays === null ? null : 30,
  });
  const currentStart = windows?.current.startAt;
  const previous = windows?.previous ?? null;
  const teamByRecipient = new Map<string, { id: string; name: string }>();
  for (const team of dashboard.teams) {
    for (const assignment of team.timeliness.assignments) {
      for (const athlete of assignment.athletes) {
        teamByRecipient.set(athlete.recipientId, {
          id: team.teamId,
          name: team.teamName,
        });
      }
    }
  }
  const facts: OrganizationTimelinessDrilldownFact[] =
    dashboard.assignments.flatMap((assignment) =>
      assignment.recipients.flatMap((recipient) =>
        recipient.occurrences.flatMap((occurrence) => {
          const classified = classifyOccurrenceTimeliness({
            occurrence: {
              athleteUserId: recipient.athleteUserId,
              dueAt: occurrence.dueAt,
              firstSubmittedAt: occurrence.submittedAt,
              policyEffectiveAt: occurrence.policyEffectiveAt,
            },
            asOf: input.asOf,
          });
          if (!classified) return [];
          const cohort =
            previous &&
            classified.dueAt >= previous.startAt &&
            classified.dueAt < previous.endAt
              ? "previous"
              : currentStart && classified.dueAt < currentStart
                ? null
                : "current";
          if (!cohort) return [];
          const team = teamByRecipient.get(recipient.id);
          return [
            {
              metric: "timeliness" as const,
              cohort,
              athleteName: recipient.fullName?.trim() || recipient.email,
              athleteEmail: recipient.email,
              athleteUserId: recipient.athleteUserId,
              assignmentId: assignment.id,
              assignmentName: assignment.sourceName,
              assignmentTimezone: assignment.timezone,
              sessionId: occurrence.sessionId,
              scheduledDate: occurrence.scheduledDate,
              workoutName: occurrence.workoutName,
              label: occurrence.label,
              state: classified.state,
              dueAt: classified.dueAt,
              submittedAt: classified.firstSubmittedAt,
              latenessMilliseconds: classified.latenessMilliseconds,
              overdueMilliseconds: classified.overdueMilliseconds,
              teamId: team?.id ?? null,
              teamName: team?.name ?? null,
            },
          ];
        }),
      ),
    );
  return facts.filter((fact) => {
    if (input.metric === "lateCompleted") return fact.state === "lateCompleted";
    if (input.tab === "all") return true;
    return (
      (input.tab === "onTime" && fact.state === "onTimeCompleted") ||
      (input.tab === "late" && fact.state === "lateCompleted") ||
      (input.tab === "openOverdue" && fact.state === "openOverdue")
    );
  });
}

export async function listTeamTrainingLoadDrilldownFacts(
  database: Parameters<typeof getTeamComplianceDashboard>[0],
  input: {
    organizationId: string;
    teamId: string;
    metric: Extract<
      PerformanceDrilldownMetric,
      "capture" | "internalLoad" | "externalWork"
    >;
    tab: PerformanceDrilldownTab;
    windowDays: number | null;
    asOf: Date;
  },
): Promise<TeamTrainingLoadDrilldownFact[]> {
  const details = await listTeamTrainingLoadDetails(database, input);
  const athleteIds = [
    ...new Set(details.map((detail) => detail.athleteUserId)),
  ];
  const people = athleteIds.length
    ? await database
        .select({ id: users.id, email: users.email, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, athleteIds))
    : [];
  const personById = new Map(people.map((person) => [person.id, person]));
  const facts: TeamTrainingLoadDrilldownFact[] = details.map((detail) => {
    const person = personById.get(detail.athleteUserId);
    const captureState =
      detail.durationMinutes === null && detail.sessionRpe === null
        ? "missingBoth"
        : detail.durationMinutes === null
          ? "missingDuration"
          : detail.sessionRpe === null
            ? "missingRpe"
            : "available";
    const externalWorkState =
      detail.externalWork.state === "externalWorkComparable"
        ? "comparable"
        : detail.externalWork.state === "externalWorkPartial"
          ? "partial"
          : "unavailable";
    return {
      metric: "trainingLoad",
      athleteName:
        person?.fullName?.trim() || person?.email || "Former athlete",
      athleteEmail: person?.email || "",
      athleteUserId: detail.athleteUserId,
      assignmentId: detail.assignmentId,
      sessionId: detail.id,
      scheduledDate: detail.scheduledDate,
      durationMinutes: detail.durationMinutes,
      sessionRpe: detail.sessionRpe,
      internalLoad: detail.internalLoad.internalLoad,
      captureState,
      externalWorkState,
      prescribedVolumeKg: detail.externalWork.prescribedVolumeKg,
      completedVolumeKg: detail.externalWork.completedVolumeKg,
      completedMeasurableRowCount:
        detail.externalWork.completedMeasurableRowCount,
      completedRowCount: detail.externalWork.completedRowCount,
      unavailableReason: detail.externalWork.unavailableReason,
    };
  });
  return facts.filter((fact) => {
    if (input.metric === "capture") {
      return input.tab === "all" || fact.captureState === input.tab;
    }
    if (input.metric === "internalLoad") return true;
    return input.tab === "all" || fact.externalWorkState === input.tab;
  });
}

export async function listOrganizationTrainingLoadDrilldownFacts(
  database: Parameters<typeof getOrganizationComplianceDashboard>[0],
  input: {
    organizationId: string;
    metric: Extract<
      PerformanceDrilldownMetric,
      "capture" | "internalLoad" | "externalWork"
    >;
    tab: PerformanceDrilldownTab;
    windowDays: number | null;
    asOf: Date;
  },
): Promise<OrganizationTrainingLoadDrilldownFact[]> {
  const details = await listOrganizationTrainingLoadDetails(database, input);
  const athleteIds = [
    ...new Set(details.map((detail) => detail.athleteUserId)),
  ];
  const recipientIds = [
    ...new Set(details.map((detail) => detail.recipientId)),
  ];
  const [people, scopes] = await Promise.all([
    athleteIds.length
      ? database
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
          })
          .from(users)
          .where(inArray(users.id, athleteIds))
      : Promise.resolve([]),
    recipientIds.length
      ? database
          .select({
            recipientId: assignmentRecipientTeamScopes.recipientId,
            teamId: teams.id,
            teamName: teams.name,
          })
          .from(assignmentRecipientTeamScopes)
          .innerJoin(
            teams,
            and(
              eq(
                teams.organizationId,
                assignmentRecipientTeamScopes.organizationId,
              ),
              eq(teams.id, assignmentRecipientTeamScopes.teamId),
            ),
          )
          .where(
            and(
              eq(
                assignmentRecipientTeamScopes.organizationId,
                input.organizationId,
              ),
              inArray(assignmentRecipientTeamScopes.recipientId, recipientIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const personById = new Map(people.map((person) => [person.id, person]));
  const scopeByRecipient = new Map(
    scopes.map((scope) => [scope.recipientId, scope]),
  );
  const facts: OrganizationTrainingLoadDrilldownFact[] = details.map(
    (detail) => {
      const person = personById.get(detail.athleteUserId);
      const scope = scopeByRecipient.get(detail.recipientId);
      const captureState =
        detail.durationMinutes === null && detail.sessionRpe === null
          ? "missingBoth"
          : detail.durationMinutes === null
            ? "missingDuration"
            : detail.sessionRpe === null
              ? "missingRpe"
              : "available";
      const externalWorkState =
        detail.externalWork.state === "externalWorkComparable"
          ? "comparable"
          : detail.externalWork.state === "externalWorkPartial"
            ? "partial"
            : "unavailable";
      return {
        metric: "trainingLoad",
        athleteName:
          person?.fullName?.trim() || person?.email || "Former athlete",
        athleteEmail: person?.email || "",
        athleteUserId: detail.athleteUserId,
        assignmentId: detail.assignmentId,
        sessionId: detail.id,
        scheduledDate: detail.scheduledDate,
        durationMinutes: detail.durationMinutes,
        sessionRpe: detail.sessionRpe,
        internalLoad: detail.internalLoad.internalLoad,
        captureState,
        externalWorkState,
        prescribedVolumeKg: detail.externalWork.prescribedVolumeKg,
        completedVolumeKg: detail.externalWork.completedVolumeKg,
        completedMeasurableRowCount:
          detail.externalWork.completedMeasurableRowCount,
        completedRowCount: detail.externalWork.completedRowCount,
        unavailableReason: detail.externalWork.unavailableReason,
        teamId: scope?.teamId ?? null,
        teamName: scope?.teamName ?? null,
      };
    },
  );
  return facts.filter((fact) => {
    if (input.metric === "capture") {
      return input.tab === "all" || fact.captureState === input.tab;
    }
    if (input.metric === "internalLoad") return true;
    return input.tab === "all" || fact.externalWorkState === input.tab;
  });
}
