import { describe, expect, it } from "vitest";

import {
  isValidIanaTimezone,
  isSubmissionOnTime,
  resolveEquivalentMetricWindows,
  resolveLateEntryUntil,
  resolveOccurrenceDueAt,
  type TimelinessPolicy,
} from "./timeliness-policy";

const policy: TimelinessPolicy = {
  version: 1,
  effectiveAt: new Date("2026-08-12T00:00:00.000Z"),
  fixedDueLocalMinute: 1440,
  weeklyDueDay: 7,
  weeklyDueLocalMinute: 1440,
  lateEntryDays: 7,
};

describe("timeliness policy", () => {
  it("resolves fixed workout and fixed-day plan deadlines identically", () => {
    const input = {
      scheduledDate: "2026-08-12",
      scheduleType: "fixed" as const,
      timezone: "America/New_York",
      policy,
    };

    expect(resolveOccurrenceDueAt(input)?.toISOString()).toBe(
      "2026-08-13T04:00:00.000Z",
    );
    expect(resolveOccurrenceDueAt(input)?.toISOString()).toBe(
      "2026-08-13T04:00:00.000Z",
    );
  });

  it("resolves weekly frequency at the Monday boundary after Sunday", () => {
    expect(
      resolveOccurrenceDueAt({
        scheduledDate: "2026-08-12",
        scheduleType: "weekly_frequency",
        timezone: "America/New_York",
        policy,
      })?.toISOString(),
    ).toBe("2026-08-17T04:00:00.000Z");
  });

  it("retains the weekly deadline in a partial final week", () => {
    expect(
      resolveOccurrenceDueAt({
        scheduledDate: "2026-08-12",
        scheduleType: "weekly_frequency",
        timezone: "America/New_York",
        policy,
        effectiveEndDate: "2026-08-12",
      })?.toISOString(),
    ).toBe("2026-08-17T04:00:00.000Z");
  });

  it("handles spring-forward and fall-back deadline dates", () => {
    expect(
      resolveOccurrenceDueAt({
        scheduledDate: "2026-03-08",
        scheduleType: "fixed",
        timezone: "America/New_York",
        policy,
      })?.toISOString(),
    ).toBe("2026-03-09T04:00:00.000Z");
    expect(
      resolveOccurrenceDueAt({
        scheduledDate: "2026-11-01",
        scheduleType: "fixed",
        timezone: "America/New_York",
        policy,
      })?.toISOString(),
    ).toBe("2026-11-02T05:00:00.000Z");
  });

  it("supports non-hour UTC offsets", () => {
    expect(
      resolveOccurrenceDueAt({
        scheduledDate: "2026-01-01",
        scheduleType: "fixed",
        timezone: "Asia/Kathmandu",
        policy,
      })?.toISOString(),
    ).toBe("2026-01-01T18:15:00.000Z");
  });

  it("adds late-entry days as local calendar days across DST", () => {
    const dueAt = resolveOccurrenceDueAt({
      scheduledDate: "2026-03-07",
      scheduleType: "fixed",
      timezone: "America/New_York",
      policy,
    })!;

    expect(dueAt.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(
      resolveLateEntryUntil({
        dueAt,
        timezone: "America/New_York",
        lateEntryDays: 7,
      }).toISOString(),
    ).toBe("2026-03-15T04:00:00.000Z");
  });

  it("does not resolve occurrences after an effective cancellation end", () => {
    expect(
      resolveOccurrenceDueAt({
        scheduledDate: "2026-08-13",
        scheduleType: "fixed",
        timezone: "UTC",
        policy,
        effectiveEndDate: "2026-08-12",
      }),
    ).toBeNull();
  });

  it("builds equal non-overlapping current and previous windows", () => {
    const windows = resolveEquivalentMetricWindows({
      asOf: new Date("2026-08-12T12:00:00.000Z"),
      windowDays: 30,
    });

    expect(windows).toEqual({
      current: {
        startAt: new Date("2026-07-13T12:00:00.000Z"),
        endAt: new Date("2026-08-12T12:00:00.000Z"),
      },
      previous: {
        startAt: new Date("2026-06-13T12:00:00.000Z"),
        endAt: new Date("2026-07-13T12:00:00.000Z"),
      },
    });
    expect(
      resolveEquivalentMetricWindows({
        asOf: new Date("2026-08-12T12:00:00.000Z"),
        windowDays: null,
      }),
    ).toBeNull();
  });

  it("treats a submission at the deadline boundary as late", () => {
    const dueAt = new Date("2026-08-13T04:00:00.000Z");

    expect(
      isSubmissionOnTime({
        submittedAt: new Date(dueAt.getTime() - 1),
        dueAt,
      }),
    ).toBe(true);
    expect(isSubmissionOnTime({ submittedAt: dueAt, dueAt })).toBe(false);
  });

  it("validates IANA timezones", () => {
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
    expect(isValidIanaTimezone("Not/A_Timezone")).toBe(false);
  });
});
