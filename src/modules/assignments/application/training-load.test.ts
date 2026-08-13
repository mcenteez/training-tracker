import { describe, expect, it } from "vitest";

import {
  buildInternalLoadBaseline,
  calculateInternalLoad,
  compareExternalWork,
  normalizeStrengthLoad,
} from "./training-load";

describe("training load", () => {
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
  });

  it("distinguishes comparable and partial strength volume", () => {
    expect(
      compareExternalWork({
        prescribed: [{ reps: 10, normalizedLoadKg: 60 }],
        completed: [{ reps: 20, normalizedLoadKg: 60 }],
      }),
    ).toMatchObject({
      state: "comparable",
      prescribedVolumeKg: 600,
      completedVolumeKg: 1200,
      completion: 2,
    });
    expect(
      compareExternalWork({
        prescribed: [{ reps: 10, normalizedLoadKg: 60 }],
        completed: [{ reps: null, normalizedLoadKg: null }],
      }).state,
    ).toBe("partial");
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
