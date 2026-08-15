import { describe, expect, it } from "vitest";

import {
  buildInternalLoadBaseline,
  buildIndividualInternalLoadBaseline,
  buildInternalLoadMetric,
  calculateInternalLoad,
  compareExternalWork,
  normalizeStrengthLoad,
} from "./training-load";

describe("training load", () => {
  it.each([
    ["relative_resistance", "relative_resistance"],
    ["non_weight_resistance", "non_weight_resistance"],
    ["legacy_resistance", "legacy_resistance"],
  ] as const)(
    "preserves %s as the external-work unavailable reason",
    (reason, expected) => {
      expect(
        compareExternalWork({
          prescribed: [
            { reps: 5, normalizedLoadKg: null, unavailableReason: reason },
          ],
          completed: [{ reps: 5, normalizedLoadKg: 60 }],
        }).unavailableReason,
      ).toBe(expected);
    },
  );
  it("normalizes pound loads to kilograms", () => {
    expect(normalizeStrengthLoad({ value: 135, unit: "lb" })).toEqual({
      value: 135,
      unit: "lb",
      normalizedKg: 61.23496995,
    });
  });

  it("calculates internal load only from valid duration and RPE", () => {
    expect(calculateInternalLoad(45, 7)).toBe(315);
    expect(calculateInternalLoad(45, null)).toBeNull();
    expect(buildInternalLoadMetric(null, 7)).toEqual({
      state: "notCaptured",
      durationMinutes: null,
      sessionRpe: 7,
      internalLoad: null,
      sampleCount: 0,
      unavailableReasons: ["missing_duration"],
    });
    expect(buildInternalLoadMetric(45, null)).toMatchObject({
      state: "notCaptured",
      sampleCount: 0,
      unavailableReasons: ["missing_rpe"],
    });
  });

  it("distinguishes comparable and partial strength volume", () => {
    expect(
      compareExternalWork({
        prescribed: [{ reps: 10, normalizedLoadKg: 60 }],
        completed: [{ reps: 20, normalizedLoadKg: 60 }],
      }),
    ).toMatchObject({
      state: "externalWorkComparable",
      prescribedVolumeKg: 600,
      completedVolumeKg: 1200,
      completion: 2,
    });
    expect(
      compareExternalWork({
        prescribed: [{ reps: 10, normalizedLoadKg: 60 }],
        completed: [{ reps: null, normalizedLoadKg: null }],
      }),
    ).toMatchObject({
      state: "externalWorkPartial",
      prescribedMeasurableRowCount: 1,
      completedMeasurableRowCount: 0,
      unavailableReason: "unmeasurable_external_work",
    });
    expect(
      compareExternalWork({
        prescribed: [{ reps: null, normalizedLoadKg: null }],
        completed: [{ reps: null, normalizedLoadKg: null }],
      }),
    ).toMatchObject({
      state: "externalWorkUnavailable",
      prescribedMeasurableRowCount: 0,
      completedMeasurableRowCount: 0,
      prescribedVolumeKg: null,
      completedVolumeKg: null,
      completion: null,
      unavailableReason: "unmeasurable_external_work",
    });
    expect(
      compareExternalWork({
        prescribed: [{ reps: 0, normalizedLoadKg: 60 }],
        completed: [{ reps: 0, normalizedLoadKg: 60 }],
      }).completion,
    ).toBeNull();
  });

  it("excludes the current session and applies preceding timezone calendar boundaries", () => {
    const baseline = buildIndividualInternalLoadBaseline({
      currentSessionId: "current",
      currentScheduledAt: new Date("2026-03-10T00:30:00.000Z"),
      currentDurationMinutes: 30,
      currentSessionRpe: 10,
      timeZone: "America/Los_Angeles",
      sessions: [
        {
          sessionId: "current",
          status: "submitted",
          scheduledAt: new Date("2026-03-01T12:00:00.000Z"),
          durationMinutes: 100,
          sessionRpe: 10,
        },
        {
          sessionId: "window-start",
          status: "submitted",
          scheduledAt: new Date("2026-02-10T07:30:00.000Z"),
          durationMinutes: 10,
          sessionRpe: 10,
        },
        {
          sessionId: "middle",
          status: "submitted",
          scheduledAt: new Date("2026-02-20T12:00:00.000Z"),
          durationMinutes: 20,
          sessionRpe: 10,
        },
        {
          sessionId: "window-end",
          status: "submitted",
          scheduledAt: new Date("2026-03-09T07:30:00.000Z"),
          durationMinutes: 40,
          sessionRpe: 10,
        },
        {
          sessionId: "outside",
          status: "submitted",
          scheduledAt: new Date("2026-02-10T07:29:00.000Z"),
          durationMinutes: 90,
          sessionRpe: 10,
        },
        {
          sessionId: "not-submitted",
          status: "in_progress",
          scheduledAt: new Date("2026-03-05T12:00:00.000Z"),
          durationMinutes: 90,
          sessionRpe: 10,
        },
      ],
    });

    expect(baseline).toMatchObject({
      state: "available",
      sampleCount: 3,
      currentInternalLoad: 300,
      medianInternalLoad: 200,
      difference: 100,
      differencePercent: 0.5,
      windowStartDate: "2026-02-09",
      windowEndDate: "2026-03-08",
      unavailableReason: null,
    });
  });

  it("uses at least three preceding sessions for an individual median baseline", () => {
    expect(buildInternalLoadBaseline(300, [100, 200])).toMatchObject({
      state: "insufficient_history",
      sampleCount: 2,
    });
    expect(buildInternalLoadBaseline(300, [100, 200, 400])).toMatchObject({
      state: "available",
      medianInternalLoad: 200,
      difference: 100,
      differencePercent: 0.5,
    });
  });
});
