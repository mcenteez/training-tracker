import { z } from "zod";

export const performanceDrilldownMetrics = [
  "completion",
  "attention",
  "overdue",
  "dueNow",
  "onTime",
  "lateCompleted",
  "capture",
  "internalLoad",
  "externalWork",
] as const;

export type PerformanceDrilldownMetric =
  (typeof performanceDrilldownMetrics)[number];

const tabsByMetric = {
  completion: ["all", "completed", "overdue", "started", "dueToday"],
  attention: ["all"],
  overdue: ["all"],
  dueNow: ["all", "started", "dueToday"],
  onTime: ["all", "onTime", "late", "openOverdue"],
  lateCompleted: ["all"],
  capture: ["all", "available", "missingDuration", "missingRpe", "missingBoth"],
  internalLoad: ["all"],
  externalWork: ["all", "comparable", "partial", "unavailable"],
} as const;

export type PerformanceDrilldownTab =
  (typeof tabsByMetric)[PerformanceDrilldownMetric][number];

export type DrilldownUnavailableState =
  | { state: "available" }
  | {
      state: "unavailable";
      reason:
        | "missingDuration"
        | "missingRpe"
        | "missingBoth"
        | "unmeasurableExternalWork"
        | "insufficientHistory";
      message: string;
    };

export function drilldownUnavailableState(input: {
  durationMinutes: number | null;
  sessionRpe: number | null;
  externalWorkState?: "comparable" | "partial" | "unavailable";
  baselineSampleCount?: number;
}): DrilldownUnavailableState[] {
  const states: DrilldownUnavailableState[] = [];
  if (input.durationMinutes === null && input.sessionRpe === null) {
    states.push({
      state: "unavailable",
      reason: "missingBoth",
      message: "Duration and session RPE were not recorded.",
    });
  } else if (input.durationMinutes === null) {
    states.push({
      state: "unavailable",
      reason: "missingDuration",
      message: "Duration was not recorded.",
    });
  } else if (input.sessionRpe === null) {
    states.push({
      state: "unavailable",
      reason: "missingRpe",
      message: "Session RPE was not recorded.",
    });
  }
  if (input.externalWorkState === "unavailable") {
    states.push({
      state: "unavailable",
      reason: "unmeasurableExternalWork",
      message: "No numeric strength-load rows were recorded.",
    });
  }
  if (
    input.baselineSampleCount !== undefined &&
    input.baselineSampleCount < 3
  ) {
    states.push({
      state: "unavailable",
      reason: "insufficientHistory",
      message: `${input.baselineSampleCount} of 3 required preceding sessions are available for an individual baseline.`,
    });
  }
  return states.length > 0 ? states : [{ state: "available" }];
}

const windowSchema = z.enum(["30", "90", "all"]).default("30");

export const performanceDrilldownSearchSchema = z
  .object({
    metric: z.enum(performanceDrilldownMetrics),
    window: windowSchema,
    tab: z.string().optional(),
  })
  .transform((input, context) => {
    const tabs = tabsByMetric[input.metric] as readonly string[];
    const tab = input.tab ?? "all";
    if (!tabs.includes(tab)) {
      context.addIssue({
        code: "custom",
        path: ["tab"],
        message: "This tab is not available for the selected metric.",
      });
      return z.NEVER;
    }
    return {
      metric: input.metric,
      tab: tab as PerformanceDrilldownTab,
      windowDays: input.window === "all" ? null : Number(input.window),
      window: input.window,
    };
  });

export function tabsForPerformanceDrilldown(
  metric: PerformanceDrilldownMetric,
): readonly PerformanceDrilldownTab[] {
  return tabsByMetric[metric] as readonly PerformanceDrilldownTab[];
}

export function performanceDrilldownLabel(
  metric: PerformanceDrilldownMetric,
): string {
  return {
    completion: "Completion facts",
    attention: "Athletes needing attention",
    overdue: "Open overdue occurrences",
    dueNow: "Due now occurrences",
    onTime: "On-time completion facts",
    lateCompleted: "Late completed occurrences",
    capture: "Load capture facts",
    internalLoad: "Internal load facts",
    externalWork: "External work facts",
  }[metric];
}

export function performanceDrilldownTabLabel(
  tab: PerformanceDrilldownTab,
): string {
  return {
    all: "All",
    completed: "Completed",
    overdue: "Overdue",
    started: "Started",
    dueToday: "Due today",
    onTime: "On time",
    late: "Late",
    openOverdue: "Open overdue",
    available: "Available",
    missingDuration: "Missing duration",
    missingRpe: "Missing RPE",
    missingBoth: "Missing both",
    comparable: "Comparable",
    partial: "Partial",
    unavailable: "Unavailable",
  }[tab];
}
