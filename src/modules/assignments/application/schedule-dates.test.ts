import { describe, expect, it } from "vitest";

import {
  addDays,
  currentWeekWindow,
  listFixedDayDates,
  mondayOf,
  toLocalDateString,
  weekdayOf,
} from "./schedule-dates";

describe("schedule dates", () => {
  it("derives weekdays independent of host timezone", () => {
    expect(weekdayOf("2026-08-10")).toBe("monday");
    expect(weekdayOf("2026-08-16")).toBe("sunday");
  });

  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-08-10")).toBe("2026-08-10");
    expect(mondayOf("2026-08-13")).toBe("2026-08-10");
    expect(mondayOf("2026-08-16")).toBe("2026-08-10");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("converts instants to assignment-local dates", () => {
    const lateUtc = new Date("2026-08-11T03:00:00.000Z");
    expect(toLocalDateString(lateUtc, "UTC")).toBe("2026-08-11");
    expect(toLocalDateString(lateUtc, "America/New_York")).toBe("2026-08-10");
  });

  it("computes the current local week window", () => {
    const window = currentWeekWindow(
      new Date("2026-08-11T01:00:00.000Z"),
      "America/New_York",
    );

    expect(window).toEqual({
      weekStart: "2026-08-10",
      weekEnd: "2026-08-16",
    });
  });

  it("keeps local week boundaries stable across DST transitions", () => {
    const beforeFallBack = currentWeekWindow(
      new Date("2026-11-01T05:30:00.000Z"),
      "America/New_York",
    );

    expect(beforeFallBack).toEqual({
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
    });
  });

  it("lists fixed-day occurrences bounded by the assignment range", () => {
    expect(
      listFixedDayDates({
        dayOfWeek: "monday",
        startDate: "2026-08-11",
        endDate: "2026-08-31",
      }),
    ).toEqual(["2026-08-17", "2026-08-24", "2026-08-31"]);

    expect(
      listFixedDayDates({
        dayOfWeek: "tuesday",
        startDate: "2026-08-11",
        endDate: "2026-08-11",
      }),
    ).toEqual(["2026-08-11"]);

    expect(
      listFixedDayDates({
        dayOfWeek: "monday",
        startDate: "2026-08-12",
        endDate: "2026-08-11",
      }),
    ).toEqual([]);
  });
});
