import { describe, expect, it } from "vitest";

import {
  buildComplianceSummary,
  type AthleteComplianceInput,
} from "./compliance-summary";

function athlete(
  athleteUserId: string,
  counts: Partial<AthleteComplianceInput["counts"]>,
  overdueDates: string[] = [],
): AthleteComplianceInput {
  return {
    athleteUserId,
    counts: {
      completed: 0,
      overdue: 0,
      started: 0,
      dueToday: 0,
      upcoming: 0,
      ...counts,
    },
    overdueDates,
  };
}

describe("buildComplianceSummary", () => {
  it("calculates rates from eligible due work and excludes upcoming work", () => {
    const summary = buildComplianceSummary({
      athletes: [
        athlete("athlete-1", {
          completed: 4,
          overdue: 1,
          started: 1,
          dueToday: 2,
          upcoming: 20,
        }),
      ],
    });

    expect(summary.eligibleDue).toBe(8);
    expect(summary.completionRate).toBe(0.5);
    expect(summary.outstandingRate).toBe(0.5);
    expect(summary.counts.upcoming).toBe(20);
  });

  it("returns unavailable rates when no work is due", () => {
    const summary = buildComplianceSummary({
      athletes: [athlete("athlete-1", { upcoming: 3 })],
      rosteredAthleteIds: ["athlete-1"],
    });

    expect(summary.eligibleDue).toBe(0);
    expect(summary.completionRate).toBeNull();
    expect(summary.outstandingRate).toBeNull();
    expect(summary.engagementRate).toBeNull();
    expect(summary.athleteCoverage).toBe(0);
  });

  it("deduplicates attention and engagement across assignments and teams", () => {
    const summary = buildComplianceSummary({
      athletes: [
        athlete("athlete-1", { overdue: 1, completed: 1 }, ["2026-08-01"]),
        athlete("athlete-1", { overdue: 2, started: 1 }, ["2026-07-30"]),
        athlete("athlete-2", { completed: 2 }),
      ],
      rosteredAthleteIds: ["athlete-1", "athlete-1", "athlete-2", "athlete-3"],
    });

    expect(summary.athletesNeedingAttention).toBe(1);
    expect(summary.engagedAthletes).toBe(2);
    expect(summary.athletesWithEligibleDue).toBe(2);
    expect(summary.engagementRate).toBe(1);
    expect(summary.oldestOverdueDate).toBe("2026-07-30");
    expect(summary.rosteredAthletes).toBe(3);
    expect(summary.programmedAthletes).toBe(2);
    expect(summary.athleteCoverage).toBeCloseTo(2 / 3);
  });

  it("handles empty team and organization inputs", () => {
    const summary = buildComplianceSummary({ athletes: [] });

    expect(summary.counts).toEqual({
      completed: 0,
      overdue: 0,
      started: 0,
      dueToday: 0,
      upcoming: 0,
    });
    expect(summary.completionRate).toBeNull();
    expect(summary.athleteCoverage).toBeNull();
    expect(summary.athletesNeedingAttention).toBe(0);
  });
});
