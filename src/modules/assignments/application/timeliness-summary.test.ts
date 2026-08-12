import { describe, expect, it } from "vitest";

import {
  buildTimelinessSummary,
  classifyOccurrenceTimeliness,
  type TimelinessOccurrenceInput,
} from "./timeliness-summary";

const asOf = new Date("2026-08-12T12:00:00.000Z");
const effectiveAt = new Date("2026-07-01T00:00:00.000Z");

function occurrence(
  overrides: Partial<TimelinessOccurrenceInput> = {},
): TimelinessOccurrenceInput {
  return {
    athleteUserId: "athlete-1",
    dueAt: new Date("2026-08-12T10:00:00.000Z"),
    firstSubmittedAt: null,
    policyEffectiveAt: effectiveAt,
    ...overrides,
  };
}

describe("timeliness summary", () => {
  it("classifies submissions immediately before, at, and after the boundary", () => {
    const dueAt = new Date("2026-08-12T10:00:00.000Z");

    expect(
      classifyOccurrenceTimeliness({
        occurrence: occurrence({
          dueAt,
          firstSubmittedAt: new Date(dueAt.getTime() - 1),
        }),
        asOf,
      })?.state,
    ).toBe("onTimeCompleted");
    expect(
      classifyOccurrenceTimeliness({
        occurrence: occurrence({ dueAt, firstSubmittedAt: dueAt }),
        asOf,
      }),
    ).toMatchObject({ state: "lateCompleted", latenessMilliseconds: 0 });
    expect(
      classifyOccurrenceTimeliness({
        occurrence: occurrence({
          dueAt,
          firstSubmittedAt: new Date(dueAt.getTime() + 60_000),
        }),
        asOf,
      }),
    ).toMatchObject({
      state: "lateCompleted",
      latenessMilliseconds: 60_000,
    });
  });

  it("classifies unsubmitted work before and at its deadline", () => {
    expect(
      classifyOccurrenceTimeliness({
        occurrence: occurrence({
          dueAt: new Date(asOf.getTime() + 1),
        }),
        asOf,
      })?.state,
    ).toBe("notYetDue");
    expect(
      classifyOccurrenceTimeliness({
        occurrence: occurrence({ dueAt: asOf }),
        asOf,
      })?.state,
    ).toBe("openOverdue");
  });

  it("excludes null and pre-policy deadlines", () => {
    expect(
      classifyOccurrenceTimeliness({
        occurrence: occurrence({ dueAt: null }),
        asOf,
      }),
    ).toBeNull();
    expect(
      classifyOccurrenceTimeliness({
        occurrence: occurrence({
          dueAt: new Date("2026-06-30T23:59:59.999Z"),
        }),
        asOf,
      }),
    ).toBeNull();
  });

  it("calculates rates, raw counts, lateness, and oldest open overdue", () => {
    const summary = buildTimelinessSummary({
      asOf,
      occurrences: [
        occurrence({
          firstSubmittedAt: new Date("2026-08-12T09:00:00.000Z"),
        }),
        occurrence({
          firstSubmittedAt: new Date("2026-08-12T11:00:00.000Z"),
        }),
        occurrence({ dueAt: new Date("2026-08-10T10:00:00.000Z") }),
        occurrence({ dueAt: new Date("2026-08-13T10:00:00.000Z") }),
      ],
    });

    expect(summary.counts).toEqual({
      onTimeCompleted: 1,
      lateCompleted: 1,
      openOverdue: 1,
      notYetDue: 1,
    });
    expect(summary.timelinessEligible).toBe(3);
    expect(summary.onTimeCompletionRate).toBe(1 / 3);
    expect(summary.lateCompletionRate).toBe(1 / 3);
    expect(summary.averageCompletedLatenessMilliseconds).toBe(3_600_000);
    expect(summary.oldestOpenOverdueAt).toEqual(
      new Date("2026-08-10T10:00:00.000Z"),
    );
  });

  it("deduplicates athlete attention across assignments and teams", () => {
    const summary = buildTimelinessSummary({
      asOf,
      occurrences: [
        occurrence(),
        occurrence({ dueAt: new Date("2026-08-11T10:00:00.000Z") }),
        occurrence({
          athleteUserId: "athlete-2",
          firstSubmittedAt: new Date("2026-08-12T11:00:00.000Z"),
        }),
      ],
    });

    expect(summary.athletesNeedingTimelinessAttention).toBe(2);
  });

  it("returns unavailable values for no due work and no late completions", () => {
    const noDueWork = buildTimelinessSummary({
      asOf,
      occurrences: [
        occurrence({ dueAt: new Date("2026-08-13T10:00:00.000Z") }),
      ],
    });
    const onTimeOnly = buildTimelinessSummary({
      asOf,
      occurrences: [
        occurrence({
          firstSubmittedAt: new Date("2026-08-12T09:00:00.000Z"),
        }),
      ],
    });

    expect(noDueWork).toMatchObject({
      timelinessEligible: 0,
      onTimeCompletionRate: null,
      lateCompletionRate: null,
      unavailableReason: "no_due_work",
    });
    expect(onTimeOnly.averageCompletedLatenessMilliseconds).toBeNull();
  });
});
