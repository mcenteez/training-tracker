import type { TimelinessSummary } from "./timeliness-summary";

export type TrendDirection = "improved" | "declined" | "unchanged";

export interface MetricFraction {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface MetricComparison {
  current: MetricFraction;
  previous: MetricFraction;
  percentagePointChange: number | null;
  direction: TrendDirection | null;
  unavailableReason: "insufficient_history" | null;
}

export interface ComplianceTrendSummary {
  current: TimelinessSummary;
  previous: TimelinessSummary;
  onTimeCompletion: MetricComparison;
}

export function buildMetricComparison(input: {
  current: MetricFraction;
  previous: MetricFraction;
}): MetricComparison {
  if (input.current.rate === null || input.previous.rate === null) {
    return {
      ...input,
      percentagePointChange: null,
      direction: null,
      unavailableReason: "insufficient_history",
    };
  }

  const percentagePointChange =
    (input.current.rate - input.previous.rate) * 100;
  const direction =
    percentagePointChange > 0
      ? "improved"
      : percentagePointChange < 0
        ? "declined"
        : "unchanged";

  return {
    ...input,
    percentagePointChange,
    direction,
    unavailableReason: null,
  };
}

export function buildComplianceTrendSummary(input: {
  current: TimelinessSummary;
  previous: TimelinessSummary;
}): ComplianceTrendSummary {
  return {
    current: input.current,
    previous: input.previous,
    onTimeCompletion: buildMetricComparison({
      current: {
        numerator: input.current.counts.onTimeCompleted,
        denominator: input.current.timelinessEligible,
        rate: input.current.onTimeCompletionRate,
      },
      previous: {
        numerator: input.previous.counts.onTimeCompleted,
        denominator: input.previous.timelinessEligible,
        rate: input.previous.onTimeCompletionRate,
      },
    }),
  };
}
