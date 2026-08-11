import type {
  AthletePlanSessionSummary,
  AthletePlanSlotSnapshot,
} from "@/modules/assignments/db/queries";

import {
  addDays,
  compareDates,
  currentWeekWindow,
  listFixedDayDates,
  maxDate,
  minDate,
  toLocalDateString,
} from "./schedule-dates";

export type PlanOccurrenceStatus =
  "available" | "in_progress" | "submitted" | "upcoming" | "missed";

export interface FixedDayOccurrence {
  kind: "fixed_day";
  planSlotSnapshotId: string;
  workoutSnapshotId: string;
  workoutName: string;
  label: string | null;
  scheduledDate: string;
  status: PlanOccurrenceStatus;
  sessionId: string | null;
}

export interface FlexibleSlotSummary {
  kind: "weekly_frequency";
  planSlotSnapshotId: string;
  workoutSnapshotId: string;
  workoutName: string;
  label: string | null;
  targetSessionsPerWeek: number;
  completedThisWeek: number;
  inProgressDate: string | null;
  startDate: string;
  targetMet: boolean;
  weekSessions: {
    sessionId: string;
    scheduledDate: string;
    status: "in_progress" | "submitted";
  }[];
}

export interface PlanOccurrenceOverview {
  weekStart: string;
  weekEnd: string;
  today: string;
  fixedOccurrences: FixedDayOccurrence[];
  flexibleSlots: FlexibleSlotSummary[];
  completedHistory: {
    planSlotSnapshotId: string;
    workoutSnapshotId: string;
    workoutName: string;
    label: string | null;
    scheduledDate: string;
    sessionId: string;
  }[];
  nextActionable: {
    planSlotSnapshotId: string;
    workoutSnapshotId: string;
    scheduledDate: string;
  } | null;
}

function sessionStatus(
  session: AthletePlanSessionSummary | undefined,
  scheduledDate: string,
  today: string,
): { status: PlanOccurrenceStatus; sessionId: string | null } {
  if (session?.status === "submitted") {
    return { status: "submitted", sessionId: session.id };
  }

  if (session && session.status !== "assigned") {
    return { status: "in_progress", sessionId: session.id };
  }

  if (compareDates(scheduledDate, today) > 0) {
    return { status: "upcoming", sessionId: session?.id ?? null };
  }

  if (compareDates(scheduledDate, today) < 0) {
    return { status: "missed", sessionId: session?.id ?? null };
  }

  return { status: "available", sessionId: session?.id ?? null };
}

export function buildPlanOccurrenceOverview(input: {
  slots: readonly AthletePlanSlotSnapshot[];
  sessions: readonly AthletePlanSessionSummary[];
  startDate: string;
  endDate: string;
  timezone: string;
  now?: Date;
}): PlanOccurrenceOverview {
  const now = input.now ?? new Date();
  const today = toLocalDateString(now, input.timezone);
  const { weekStart, weekEnd } = currentWeekWindow(now, input.timezone);
  const eligibleWeekStart = maxDate(weekStart, input.startDate);
  const eligibleWeekEnd = minDate(weekEnd, input.endDate);

  const sessionsBySlotAndDate = new Map<string, AthletePlanSessionSummary>();
  const sessionsBySlot = new Map<string, AthletePlanSessionSummary[]>();

  for (const session of input.sessions) {
    if (session.planSlotSnapshotId) {
      sessionsBySlotAndDate.set(
        `${session.planSlotSnapshotId}:${session.scheduledDate}`,
        session,
      );
      const bucket = sessionsBySlot.get(session.planSlotSnapshotId) ?? [];
      bucket.push(session);
      sessionsBySlot.set(session.planSlotSnapshotId, bucket);
    }
  }

  const fixedOccurrences: FixedDayOccurrence[] = [];
  const flexibleSlots: FlexibleSlotSummary[] = [];
  const completedHistory: PlanOccurrenceOverview["completedHistory"] = [];

  for (const slot of input.slots) {
    const slotSessions = sessionsBySlot.get(slot.id) ?? [];

    for (const session of slotSessions) {
      if (session.status === "submitted") {
        completedHistory.push({
          planSlotSnapshotId: slot.id,
          workoutSnapshotId: slot.workoutSnapshotId,
          workoutName: slot.workoutName,
          label: slot.label,
          scheduledDate: session.scheduledDate,
          sessionId: session.id,
        });
      }
    }

    if (slot.scheduleType === "fixed_day" && slot.dayOfWeek) {
      const dates = listFixedDayDates({
        dayOfWeek: slot.dayOfWeek,
        startDate: input.startDate,
        endDate: input.endDate,
      });

      for (const scheduledDate of dates) {
        const session = sessionsBySlotAndDate.get(
          `${slot.id}:${scheduledDate}`,
        );
        const { status, sessionId } = sessionStatus(
          session,
          scheduledDate,
          today,
        );

        fixedOccurrences.push({
          kind: "fixed_day",
          planSlotSnapshotId: slot.id,
          workoutSnapshotId: slot.workoutSnapshotId,
          workoutName: slot.workoutName,
          label: slot.label,
          scheduledDate,
          status,
          sessionId,
        });
      }

      continue;
    }

    const target = slot.targetSessionsPerWeek ?? 1;
    const weekSessions = slotSessions
      .filter(
        (session) =>
          compareDates(session.scheduledDate, weekStart) >= 0 &&
          compareDates(session.scheduledDate, weekEnd) <= 0 &&
          session.status !== "assigned",
      )
      .map((session) => ({
        sessionId: session.id,
        scheduledDate: session.scheduledDate,
        status: session.status as "in_progress" | "submitted",
      }));
    const completedThisWeek = weekSessions.filter(
      (session) => session.status === "submitted",
    ).length;
    const inProgress = weekSessions.find(
      (session) => session.status === "in_progress",
    );
    const countedThisWeek = weekSessions.length;

    flexibleSlots.push({
      kind: "weekly_frequency",
      planSlotSnapshotId: slot.id,
      workoutSnapshotId: slot.workoutSnapshotId,
      workoutName: slot.workoutName,
      label: slot.label,
      targetSessionsPerWeek: target,
      completedThisWeek,
      inProgressDate: inProgress?.scheduledDate ?? null,
      startDate: today,
      targetMet: countedThisWeek >= target,
      weekSessions,
    });
  }

  fixedOccurrences.sort((a, b) =>
    compareDates(a.scheduledDate, b.scheduledDate),
  );
  completedHistory.sort((a, b) =>
    compareDates(a.scheduledDate, b.scheduledDate),
  );

  let nextActionable: PlanOccurrenceOverview["nextActionable"] = null;

  const actionableFixed = fixedOccurrences.find(
    (occurrence) =>
      occurrence.status === "available" || occurrence.status === "in_progress",
  );

  if (actionableFixed) {
    nextActionable = {
      planSlotSnapshotId: actionableFixed.planSlotSnapshotId,
      workoutSnapshotId: actionableFixed.workoutSnapshotId,
      scheduledDate: actionableFixed.scheduledDate,
    };
  } else {
    const todayInsideAssignment =
      compareDates(today, eligibleWeekStart) >= 0 &&
      compareDates(today, eligibleWeekEnd) <= 0;
    const actionableFlexible = flexibleSlots.find(
      (slot) => !slot.targetMet || slot.inProgressDate !== null,
    );

    if (actionableFlexible && todayInsideAssignment) {
      nextActionable = {
        planSlotSnapshotId: actionableFlexible.planSlotSnapshotId,
        workoutSnapshotId: actionableFlexible.workoutSnapshotId,
        scheduledDate: actionableFlexible.inProgressDate ?? today,
      };
    }
  }

  return {
    weekStart,
    weekEnd,
    today,
    fixedOccurrences,
    flexibleSlots,
    completedHistory,
    nextActionable,
  };
}

export function isDateWithinWeek(date: string, weekStart: string): boolean {
  return (
    compareDates(date, weekStart) >= 0 &&
    compareDates(date, addDays(weekStart, 6)) <= 0
  );
}
