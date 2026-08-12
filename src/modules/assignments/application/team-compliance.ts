import type { PlanDayOfWeek } from "@/modules/plans/db/schema";
import {
  resolveOccurrenceDueAt,
  type TimelinessPolicy,
} from "./timeliness-policy";

import {
  buildComplianceSummary,
  type ComplianceCounts,
  type ComplianceSummary,
} from "./compliance-summary";

import {
  addDays,
  compareDates,
  listFixedDayDates,
  maxDate,
  minDate,
  mondayOf,
  toLocalDateString,
} from "./schedule-dates";

export type TeamComplianceStatus =
  "assigned" | "in_progress" | "submitted" | "missed" | "upcoming";

export interface TeamComplianceCounts {
  assigned: number;
  inProgress: number;
  submitted: number;
  missed: number;
  upcoming: number;
}

export interface TeamComplianceAssignmentInput {
  id: string;
  sourceName: string;
  sourceType: "plan" | "workout";
  timezone: string;
  status: "published" | "canceled";
  startDate: string | null;
  endDate: string | null;
  scheduledDate: string | null;
  publishedAt: Date | null;
  canceledAt: Date | null;
  timelinessPolicyVersion?: number;
  timelinessPolicyEffectiveAt?: Date;
  fixedDueLocalMinute?: number;
  weeklyDueDay?: number;
  weeklyDueLocalMinute?: number;
  lateEntryDays?: number;
}

export interface TeamComplianceRecipientInput {
  id: string;
  assignmentId: string;
  athleteUserId: string;
  fullName: string | null;
  email: string;
}

export interface TeamComplianceSlotInput {
  id: string;
  assignmentId: string;
  workoutSnapshotId: string;
  workoutName: string;
  scheduleType: "fixed_day" | "weekly_frequency";
  dayOfWeek: PlanDayOfWeek | null;
  targetSessionsPerWeek: number | null;
  label: string | null;
}

export interface TeamComplianceSessionInput {
  id: string;
  assignmentId: string;
  recipientId: string;
  workoutSnapshotId: string;
  workoutName: string;
  planSlotSnapshotId: string | null;
  scheduledDate: string;
  status: "assigned" | "in_progress" | "submitted";
  startedAt: Date | null;
  submittedAt: Date | null;
  updatedAt: Date;
  dueAt?: Date | null;
}

export interface TeamComplianceOccurrence {
  key: string;
  sessionId: string | null;
  workoutName: string;
  label: string | null;
  scheduledDate: string;
  status: TeamComplianceStatus;
  submittedAt: Date | null;
  dueAt: Date | null;
  policyEffectiveAt: Date;
}

export interface TeamComplianceRecipient {
  id: string;
  athleteUserId: string;
  fullName: string | null;
  email: string;
  counts: TeamComplianceCounts;
  summary: ComplianceSummary;
  occurrences: TeamComplianceOccurrence[];
}

export interface TeamAssignmentCompliance {
  id: string;
  sourceName: string;
  sourceType: "plan" | "workout";
  timezone: string;
  status: "published" | "canceled";
  startDate: string | null;
  endDate: string | null;
  scheduledDate: string | null;
  publishedAt: Date | null;
  canceledAt: Date | null;
  recipientCount: number;
  counts: TeamComplianceCounts;
  summary: ComplianceSummary;
  latestActivityAt: Date | null;
  latestCompletionAt: Date | null;
  recipients: TeamComplianceRecipient[];
}

function emptyCounts(): TeamComplianceCounts {
  return {
    assigned: 0,
    inProgress: 0,
    submitted: 0,
    missed: 0,
    upcoming: 0,
  };
}

export function toComplianceCounts(
  counts: TeamComplianceCounts,
): ComplianceCounts {
  return {
    completed: counts.submitted,
    overdue: counts.missed,
    started: counts.inProgress,
    dueToday: counts.assigned,
    upcoming: counts.upcoming,
  };
}

function increment(counts: TeamComplianceCounts, status: TeamComplianceStatus) {
  if (status === "in_progress") {
    counts.inProgress += 1;
    return;
  }
  counts[status] += 1;
}

function expectedStatus(date: string, today: string): TeamComplianceStatus {
  const comparison = compareDates(date, today);
  return comparison < 0 ? "missed" : comparison > 0 ? "upcoming" : "assigned";
}

function sessionStatus(
  session: TeamComplianceSessionInput,
  today: string,
): TeamComplianceStatus {
  if (session.status === "submitted") return "submitted";
  if (session.status === "in_progress") return "in_progress";
  return expectedStatus(session.scheduledDate, today);
}

function isWithin(date: string, startDate: string, endDate: string): boolean {
  return compareDates(date, startDate) >= 0 && compareDates(date, endDate) <= 0;
}

function addOccurrence(
  recipient: TeamComplianceRecipient,
  occurrence: TeamComplianceOccurrence,
) {
  recipient.occurrences.push(occurrence);
  increment(recipient.counts, occurrence.status);
}

function assignmentTimelinessPolicy(
  assignment: TeamComplianceAssignmentInput,
): TimelinessPolicy {
  return {
    version: 1,
    effectiveAt: assignment.timelinessPolicyEffectiveAt ?? new Date(0),
    fixedDueLocalMinute: assignment.fixedDueLocalMinute ?? 1440,
    weeklyDueDay: assignment.weeklyDueDay ?? 7,
    weeklyDueLocalMinute: assignment.weeklyDueLocalMinute ?? 1440,
    lateEntryDays: assignment.lateEntryDays ?? 7,
  };
}

function occurrenceDueAt(input: {
  assignment: TeamComplianceAssignmentInput;
  scheduledDate: string;
  scheduleType: "fixed" | "weekly_frequency";
  persistedDueAt?: Date | null;
}): Date | null {
  const policy = assignmentTimelinessPolicy(input.assignment);
  const resolved =
    input.persistedDueAt ??
    resolveOccurrenceDueAt({
      scheduledDate: input.scheduledDate,
      scheduleType: input.scheduleType,
      timezone: input.assignment.timezone,
      policy,
    });

  return resolved && resolved >= policy.effectiveAt ? resolved : null;
}

function recipientPriority(recipient: TeamComplianceRecipient): number {
  if (recipient.summary.counts.overdue > 0) return 0;
  if (recipient.summary.counts.started > 0) return 1;
  if (recipient.summary.counts.dueToday > 0) return 2;
  if (
    recipient.summary.eligibleDue > 0 &&
    recipient.summary.counts.completed === recipient.summary.eligibleDue
  ) {
    return 3;
  }
  return 4;
}

function listWeekStarts(startDate: string, endDate: string): string[] {
  const weeks: string[] = [];
  for (
    let weekStart = mondayOf(startDate);
    compareDates(weekStart, endDate) <= 0;
    weekStart = addDays(weekStart, 7)
  ) {
    if (compareDates(addDays(weekStart, 6), startDate) >= 0) {
      weeks.push(weekStart);
    }
  }
  return weeks;
}

export function buildTeamAssignmentCompliance(input: {
  assignment: TeamComplianceAssignmentInput;
  recipients: readonly TeamComplianceRecipientInput[];
  slots: readonly TeamComplianceSlotInput[];
  sessions: readonly TeamComplianceSessionInput[];
  now: Date;
  windowDays?: number | null;
}): TeamAssignmentCompliance {
  const policy = assignmentTimelinessPolicy(input.assignment);
  const today = toLocalDateString(input.now, input.assignment.timezone);
  const assignmentStart =
    input.assignment.startDate ?? input.assignment.scheduledDate ?? today;
  const assignmentEnd =
    input.assignment.endDate ?? input.assignment.scheduledDate ?? today;
  const canceledDate = input.assignment.canceledAt
    ? toLocalDateString(input.assignment.canceledAt, input.assignment.timezone)
    : null;
  const effectiveEnd = canceledDate
    ? minDate(assignmentEnd, canceledDate)
    : assignmentEnd;
  const windowStart =
    input.windowDays == null
      ? assignmentStart
      : maxDate(assignmentStart, addDays(today, -input.windowDays));
  const windowEnd =
    input.windowDays == null
      ? effectiveEnd
      : minDate(effectiveEnd, addDays(today, input.windowDays));
  const recipients = input.recipients.map<TeamComplianceRecipient>(
    (recipient) => ({
      id: recipient.id,
      athleteUserId: recipient.athleteUserId,
      fullName: recipient.fullName,
      email: recipient.email,
      counts: emptyCounts(),
      summary: buildComplianceSummary({ athletes: [] }),
      occurrences: [],
    }),
  );
  const sessionsByRecipient = new Map<string, TeamComplianceSessionInput[]>();
  for (const session of input.sessions) {
    const bucket = sessionsByRecipient.get(session.recipientId) ?? [];
    bucket.push(session);
    sessionsByRecipient.set(session.recipientId, bucket);
  }

  if (compareDates(windowStart, windowEnd) <= 0) {
    for (const recipient of recipients) {
      const recipientSessions = sessionsByRecipient.get(recipient.id) ?? [];

      if (input.assignment.sourceType === "workout") {
        const scheduledDate = input.assignment.scheduledDate!;
        if (isWithin(scheduledDate, windowStart, windowEnd)) {
          const session = recipientSessions.find(
            (candidate) => candidate.scheduledDate === scheduledDate,
          );
          addOccurrence(recipient, {
            key: `${recipient.id}:workout:${scheduledDate}`,
            sessionId: session?.id ?? null,
            workoutName: session?.workoutName ?? input.assignment.sourceName,
            label: null,
            scheduledDate,
            status: session
              ? sessionStatus(session, today)
              : expectedStatus(scheduledDate, today),
            submittedAt: session?.submittedAt ?? null,
            dueAt: occurrenceDueAt({
              assignment: input.assignment,
              scheduledDate,
              scheduleType: "fixed",
              persistedDueAt: session?.dueAt,
            }),
            policyEffectiveAt: policy.effectiveAt,
          });
        }
        continue;
      }

      for (const slot of input.slots) {
        const slotSessions = recipientSessions.filter(
          (session) => session.planSlotSnapshotId === slot.id,
        );

        if (slot.scheduleType === "fixed_day" && slot.dayOfWeek) {
          const dates = listFixedDayDates({
            dayOfWeek: slot.dayOfWeek,
            startDate: windowStart,
            endDate: windowEnd,
          });
          for (const scheduledDate of dates) {
            const session = slotSessions.find(
              (candidate) => candidate.scheduledDate === scheduledDate,
            );
            addOccurrence(recipient, {
              key: `${recipient.id}:${slot.id}:${scheduledDate}`,
              sessionId: session?.id ?? null,
              workoutName: slot.workoutName,
              label: slot.label,
              scheduledDate,
              status: session
                ? sessionStatus(session, today)
                : expectedStatus(scheduledDate, today),
              submittedAt: session?.submittedAt ?? null,
              dueAt: occurrenceDueAt({
                assignment: input.assignment,
                scheduledDate,
                scheduleType: "fixed",
                persistedDueAt: session?.dueAt,
              }),
              policyEffectiveAt: policy.effectiveAt,
            });
          }
          continue;
        }

        const target = slot.targetSessionsPerWeek ?? 1;
        for (const weekStart of listWeekStarts(windowStart, windowEnd)) {
          const weekEnd = addDays(weekStart, 6);
          const eligibleStart = maxDate(weekStart, windowStart);
          const eligibleEnd = minDate(weekEnd, windowEnd);
          const weekSessions = slotSessions.filter((session) =>
            isWithin(session.scheduledDate, eligibleStart, eligibleEnd),
          );
          const completedOrStarted = weekSessions.filter(
            (session) => session.status !== "assigned",
          );

          for (const session of completedOrStarted) {
            addOccurrence(recipient, {
              key: session.id,
              sessionId: session.id,
              workoutName: slot.workoutName,
              label: slot.label,
              scheduledDate: session.scheduledDate,
              status: sessionStatus(session, today),
              submittedAt: session.submittedAt,
              dueAt: occurrenceDueAt({
                assignment: input.assignment,
                scheduledDate: session.scheduledDate,
                scheduleType: "weekly_frequency",
                persistedDueAt: session.dueAt,
              }),
              policyEffectiveAt: policy.effectiveAt,
            });
          }

          const remaining = Math.max(0, target - completedOrStarted.length);
          const quotaDate = minDate(eligibleEnd, today);
          const quotaStatus =
            compareDates(weekEnd, today) < 0
              ? "missed"
              : compareDates(weekStart, today) > 0
                ? "upcoming"
                : "assigned";
          for (let index = 0; index < remaining; index += 1) {
            addOccurrence(recipient, {
              key: `${recipient.id}:${slot.id}:${weekStart}:${index}`,
              sessionId: null,
              workoutName: slot.workoutName,
              label: slot.label ?? `Weekly target ending ${eligibleEnd}`,
              scheduledDate: quotaDate,
              status: quotaStatus,
              submittedAt: null,
              dueAt: occurrenceDueAt({
                assignment: input.assignment,
                scheduledDate: quotaDate,
                scheduleType: "weekly_frequency",
              }),
              policyEffectiveAt: policy.effectiveAt,
            });
          }
        }
      }
    }
  }

  const counts = emptyCounts();
  for (const recipient of recipients) {
    recipient.occurrences.sort((left, right) =>
      left.scheduledDate.localeCompare(right.scheduledDate),
    );
    counts.assigned += recipient.counts.assigned;
    counts.inProgress += recipient.counts.inProgress;
    counts.submitted += recipient.counts.submitted;
    counts.missed += recipient.counts.missed;
    counts.upcoming += recipient.counts.upcoming;
    recipient.summary = buildComplianceSummary({
      athletes: [
        {
          athleteUserId: recipient.athleteUserId,
          counts: toComplianceCounts(recipient.counts),
          overdueDates: recipient.occurrences
            .filter((occurrence) => occurrence.status === "missed")
            .map((occurrence) => occurrence.scheduledDate),
        },
      ],
      rosteredAthleteIds: [recipient.athleteUserId],
    });
  }

  const summary = buildComplianceSummary({
    athletes: recipients.map((recipient) => ({
      athleteUserId: recipient.athleteUserId,
      counts: toComplianceCounts(recipient.counts),
      overdueDates: recipient.occurrences
        .filter((occurrence) => occurrence.status === "missed")
        .map((occurrence) => occurrence.scheduledDate),
    })),
    rosteredAthleteIds: recipients.map((recipient) => recipient.athleteUserId),
  });
  recipients.sort((left, right) => {
    const priorityDifference =
      recipientPriority(left) - recipientPriority(right);
    if (priorityDifference !== 0) return priorityDifference;

    const overdueDifference =
      right.summary.counts.overdue - left.summary.counts.overdue;
    if (overdueDifference !== 0) return overdueDifference;

    return (left.fullName ?? left.email).localeCompare(
      right.fullName ?? right.email,
    );
  });

  const latestActivityAt = input.sessions.reduce<Date | null>(
    (latest, session) =>
      !latest || session.updatedAt.getTime() > latest.getTime()
        ? session.updatedAt
        : latest,
    null,
  );
  const latestCompletionAt = recipients
    .flatMap((recipient) => recipient.occurrences)
    .reduce<Date | null>(
      (latest, occurrence) =>
        occurrence.submittedAt &&
        (!latest || occurrence.submittedAt.getTime() > latest.getTime())
          ? occurrence.submittedAt
          : latest,
      null,
    );

  return {
    ...input.assignment,
    recipientCount: recipients.length,
    counts,
    summary,
    latestActivityAt,
    latestCompletionAt,
    recipients,
  };
}
