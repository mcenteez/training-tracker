import { describe, expect, it } from "vitest";

import {
  drilldownUnavailableState,
  performanceDrilldownSearchSchema,
  tabsForPerformanceDrilldown,
} from "./performance-drilldowns";

describe("performance drill-down contract", () => {
  it("parses an allowed compliance metric, tab, and window", () => {
    expect(
      performanceDrilldownSearchSchema.parse({
        metric: "completion",
        tab: "completed",
        window: "90",
      }),
    ).toEqual({
      metric: "completion",
      tab: "completed",
      window: "90",
      windowDays: 90,
    });
  });

  it("rejects tabs that do not belong to the selected metric", () => {
    expect(
      performanceDrilldownSearchSchema.safeParse({
        metric: "dueNow",
        tab: "late",
        window: "30",
      }).success,
    ).toBe(false);
  });

  it("defaults an omitted tab to all", () => {
    expect(
      performanceDrilldownSearchSchema.parse({
        metric: "overdue",
        window: "all",
      }),
    ).toMatchObject({ tab: "all", windowDays: null });
    expect(tabsForPerformanceDrilldown("dueNow")).toEqual([
      "all",
      "started",
      "dueToday",
    ]);
  });

  it("returns structured factual unavailable states", () => {
    expect(
      drilldownUnavailableState({
        durationMinutes: null,
        sessionRpe: null,
        externalWorkState: "unavailable",
        baselineSampleCount: 1,
      }),
    ).toEqual([
      expect.objectContaining({ reason: "missingBoth" }),
      expect.objectContaining({ reason: "unmeasurableExternalWork" }),
      expect.objectContaining({ reason: "insufficientHistory" }),
    ]);
    expect(
      drilldownUnavailableState({
        durationMinutes: 30,
        sessionRpe: 7,
        externalWorkState: "comparable",
        baselineSampleCount: 3,
      }),
    ).toEqual([{ state: "available" }]);
  });
});
