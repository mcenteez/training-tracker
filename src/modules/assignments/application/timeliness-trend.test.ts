import { describe, expect, it } from "vitest";

import {
  buildComplianceTrendSummary,
  buildMetricComparison,
} from "./timeliness-trend";
import type { TimelinessSummary } from "./timeliness-summary";

function summary(input: {
  onTime: number;
  late?: number;
  overdue?: number;
}): TimelinessSummary {
  const late = input.late ?? 0;
  const overdue = input.overdue ?? 0;
  const eligible = input.onTime + late + overdue;
  return {
    counts: {
      onTimeCompleted: input.onTime,
      lateCompleted: late,
      openOverdue: overdue,
      notYetDue: 0,
    },
    timelinessEligible: eligible,
    onTimeCompletionRate: eligible === 0 ? null : input.onTime / eligible,
    lateCompletionRate: eligible === 0 ? null : late / eligible,
    averageCompletedLatenessMilliseconds: null,
    oldestOpenOverdueAt: null,
    athletesNeedingTimelinessAttention: 0,
    unavailableReason: eligible === 0 ? "no_due_work" : null,
  };
}

describe("timeliness trends", () => {
  it.each([
    [0.75, 0.5, 25, "improved"],
    [0.25, 0.5, -25, "declined"],
    [0.5, 0.5, 0, "unchanged"],
  ] as const)(
    "compares %s with %s as %s percentage points %s",
    (currentRate, previousRate, change, direction) => {
      expect(
        buildMetricComparison({
          current: { numerator: 1, denominator: 2, rate: currentRate },
          previous: { numerator: 2, denominator: 4, rate: previousRate },
        }),
      ).toMatchObject({
        percentagePointChange: change,
        direction,
        unavailableReason: null,
      });
    },
  );

  it("preserves equal rates with different raw fractions", () => {
    const comparison = buildMetricComparison({
      current: { numerator: 1, denominator: 2, rate: 0.5 },
      previous: { numerator: 5, denominator: 10, rate: 0.5 },
    });

    expect(comparison.current).toEqual({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(comparison.previous).toEqual({
      numerator: 5,
      denominator: 10,
      rate: 0.5,
    });
    expect(comparison.direction).toBe("unchanged");
  });

  it("returns insufficient history when either denominator is unavailable", () => {
    expect(
      buildMetricComparison({
        current: { numerator: 0, denominator: 0, rate: null },
        previous: { numerator: 1, denominator: 2, rate: 0.5 },
      }),
    ).toMatchObject({
      percentagePointChange: null,
      direction: null,
      unavailableReason: "insufficient_history",
    });
    expect(
      buildMetricComparison({
        current: { numerator: 1, denominator: 2, rate: 0.5 },
        previous: { numerator: 0, denominator: 0, rate: null },
      }).unavailableReason,
    ).toBe("insufficient_history");
  });

  it("builds a trend from raw current and previous summaries", () => {
    const trend = buildComplianceTrendSummary({
      current: summary({ onTime: 3, late: 1 }),
      previous: summary({ onTime: 1, late: 1 }),
    });

    expect(trend.onTimeCompletion).toEqual({
      current: { numerator: 3, denominator: 4, rate: 0.75 },
      previous: { numerator: 1, denominator: 2, rate: 0.5 },
      percentagePointChange: 25,
      direction: "improved",
      unavailableReason: null,
    });
  });
});
