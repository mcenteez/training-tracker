import type { PlanDayOfWeek } from "@/modules/plans/db/schema";

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
}

export interface TeamComplianceOccurrence {
  key: string;
  sessionId: string | null;
  workoutName: string;
  label: string | null;
  scheduledDate: string;
  status: TeamComplianceStatus;
  submittedAt: Date | null;
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
