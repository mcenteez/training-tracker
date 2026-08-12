import { isSubmissionOnTime } from "./timeliness-policy";

export type OccurrenceTimelinessState =
  "notYetDue" | "onTimeCompleted" | "lateCompleted" | "openOverdue";

export interface TimelinessOccurrenceInput {
  athleteUserId: string;
  dueAt: Date | null;
  firstSubmittedAt: Date | null;
  policyEffectiveAt: Date;
}

export interface OccurrenceTimeliness {
  athleteUserId: string;
  dueAt: Date;
  firstSubmittedAt: Date | null;
  state: OccurrenceTimelinessState;
  latenessMilliseconds: number | null;
  overdueMilliseconds: number | null;
}

export interface TimelinessCounts {
  onTimeCompleted: number;
  lateCompleted: number;
  openOverdue: number;
  notYetDue: number;
}

export interface TimelinessSummary {
  counts: TimelinessCounts;
  timelinessEligible: number;
  onTimeCompletionRate: number | null;
  lateCompletionRate: number | null;
  averageCompletedLatenessMilliseconds: number | null;
  oldestOpenOverdueAt: Date | null;
  athletesNeedingTimelinessAttention: number;
  unavailableReason: "no_due_work" | null;
}

export function emptyTimelinessCounts(): TimelinessCounts {
  return {
    onTimeCompleted: 0,
    lateCompleted: 0,
    openOverdue: 0,
    notYetDue: 0,
  };
}

export function classifyOccurrenceTimeliness(input: {
  occurrence: TimelinessOccurrenceInput;
  asOf: Date;
}): OccurrenceTimeliness | null {
  const { occurrence, asOf } = input;
  if (
    occurrence.dueAt === null ||
    occurrence.dueAt < occurrence.policyEffectiveAt
  ) {
    return null;
  }

  if (occurrence.firstSubmittedAt) {
    const onTime = isSubmissionOnTime({
      submittedAt: occurrence.firstSubmittedAt,
      dueAt: occurrence.dueAt,
    });
    return {
      athleteUserId: occurrence.athleteUserId,
      dueAt: occurrence.dueAt,
      firstSubmittedAt: occurrence.firstSubmittedAt,
      state: onTime ? "onTimeCompleted" : "lateCompleted",
      latenessMilliseconds: onTime
        ? null
        : occurrence.firstSubmittedAt.getTime() - occurrence.dueAt.getTime(),
      overdueMilliseconds: null,
    };
  }

  return {
    athleteUserId: occurrence.athleteUserId,
    dueAt: occurrence.dueAt,
    firstSubmittedAt: null,
    state: occurrence.dueAt <= asOf ? "openOverdue" : "notYetDue",
    latenessMilliseconds: null,
    overdueMilliseconds:
      occurrence.dueAt <= asOf
        ? asOf.getTime() - occurrence.dueAt.getTime()
        : null,
  };
}

export function buildTimelinessSummary(input: {
  occurrences: readonly TimelinessOccurrenceInput[];
  asOf: Date;
}): TimelinessSummary {
  const counts = emptyTimelinessCounts();
  const athletesNeedingAttention = new Set<string>();
  const lateDurations: number[] = [];
  let oldestOpenOverdueAt: Date | null = null;

  for (const occurrence of input.occurrences) {
    const classified = classifyOccurrenceTimeliness({
      occurrence,
      asOf: input.asOf,
    });
    if (!classified) continue;

    counts[classified.state] += 1;
    if (classified.state === "lateCompleted") {
      athletesNeedingAttention.add(classified.athleteUserId);
      lateDurations.push(classified.latenessMilliseconds!);
    }
    if (classified.state === "openOverdue") {
      athletesNeedingAttention.add(classified.athleteUserId);
      if (
        oldestOpenOverdueAt === null ||
        classified.dueAt < oldestOpenOverdueAt
      ) {
        oldestOpenOverdueAt = classified.dueAt;
      }
    }
  }

  const timelinessEligible =
    counts.onTimeCompleted + counts.lateCompleted + counts.openOverdue;
  const averageCompletedLatenessMilliseconds =
    lateDurations.length === 0
      ? null
      : lateDurations.reduce((total, duration) => total + duration, 0) /
        lateDurations.length;

  return {
    counts,
    timelinessEligible,
    onTimeCompletionRate:
      timelinessEligible === 0
        ? null
        : counts.onTimeCompleted / timelinessEligible,
    lateCompletionRate:
      timelinessEligible === 0
        ? null
        : counts.lateCompleted / timelinessEligible,
    averageCompletedLatenessMilliseconds,
    oldestOpenOverdueAt,
    athletesNeedingTimelinessAttention: athletesNeedingAttention.size,
    unavailableReason: timelinessEligible === 0 ? "no_due_work" : null,
  };
}
