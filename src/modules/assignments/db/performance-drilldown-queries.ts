import "server-only";

import {
  type PerformanceDrilldownMetric,
  type PerformanceDrilldownTab,
} from "@/modules/assignments/application/performance-drilldowns";
import {
  classifyOccurrenceTimeliness,
  type OccurrenceTimelinessState,
} from "@/modules/assignments/application/timeliness-summary";
import { resolveEquivalentMetricWindows } from "@/modules/assignments/application/timeliness-policy";
import { getTeamComplianceDashboard } from "./team-compliance-queries";

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
