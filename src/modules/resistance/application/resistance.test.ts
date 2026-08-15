import { describe, expect, it } from "vitest";

import {
  adaptResistance,
  formatResistance,
  normalizeFixedWeightResistance,
  resistanceMetricEligibility,
  resistanceFromPersistence,
  resistanceSchema,
  resistanceToPersistence,
  resultResistanceSchema,
} from "./resistance";

describe("structured resistance", () => {
  it.each([
    [{ type: "fixed_weight", value: 135, unit: "lb" }, "135 lb"],
    [{ type: "percent_1rm", percentage: 80 }, "80% 1RM"],
    [{ type: "bodyweight" }, "Bodyweight"],
    [{ type: "band", description: "Heavy band" }, "Heavy band"],
    [{ type: "rpe", target: 7.5 }, "RPE 7.5"],
    [{ type: "rir", target: 2 }, "2 RIR"],
    [{ type: "free_text", description: "Moderate sled" }, "Moderate sled"],
  ] as const)("accepts and formats %j", (resistance, label) => {
    const parsed = resistanceSchema.parse(resistance);
    expect(formatResistance(parsed)).toBe(label);
  });

  it.each([
    { type: "fixed_weight", value: 0, unit: "kg" },
    { type: "fixed_weight", value: 10, unit: "stone" },
    { type: "percent_1rm", percentage: 0 },
    { type: "percent_1rm", percentage: 201 },
    { type: "bodyweight", value: 10 },
    { type: "band", description: "" },
    { type: "rpe", target: 7.3 },
    { type: "rpe", target: 10.5 },
    { type: "rir", target: 1.5 },
    { type: "free_text", description: "" },
  ])("rejects invalid or cross-type payload %j", (resistance) => {
    expect(resistanceSchema.safeParse(resistance).success).toBe(false);
  });

  it("limits result resistance to recorded methods", () => {
    expect(
      resultResistanceSchema.safeParse({
        type: "fixed_weight",
        value: 100,
        unit: "kg",
      }).success,
    ).toBe(true);
    expect(
      resultResistanceSchema.safeParse({
        type: "percent_1rm",
        percentage: 80,
      }).success,
    ).toBe(false);
    expect(
      resultResistanceSchema.safeParse({ type: "rpe", target: 8 }).success,
    ).toBe(false);
  });

  it("normalizes only fixed weight with the exact pound conversion", () => {
    expect(
      normalizeFixedWeightResistance({
        type: "fixed_weight",
        value: 135,
        unit: "lb",
      }),
    ).toEqual({
      type: "fixed_weight",
      value: 135,
      unit: "lb",
      normalizedWeightKg: 61.23496995,
    });
    expect(
      resistanceMetricEligibility({ type: "percent_1rm", percentage: 80 }),
    ).toEqual({ eligible: false, reason: "relative_resistance" });
    expect(resistanceMetricEligibility({ type: "bodyweight" })).toEqual({
      eligible: false,
      reason: "non_weight_resistance",
    });
  });

  it("adapts current numeric and text columns without parsing text", () => {
    expect(
      adaptResistance({
        resistance: null,
        legacyLoad: "135 lb",
        legacyLoadValue: "135",
        legacyLoadUnit: "lb",
        legacyNormalizedLoadKg: "61.23496995",
      }),
    ).toEqual({
      resistance: { type: "fixed_weight", value: 135, unit: "lb" },
      normalizedWeightKg: 61.23496995,
      source: "legacy_numeric",
    });
    expect(
      adaptResistance({
        resistance: null,
        legacyLoad: "80% 1RM",
        legacyLoadValue: null,
        legacyLoadUnit: null,
        legacyNormalizedLoadKg: null,
      }),
    ).toEqual({
      resistance: { type: "free_text", description: "80% 1RM" },
      normalizedWeightKg: null,
      source: "legacy_text",
    });
  });

  it("prefers structured values and never gives descriptive resistance kilograms", () => {
    expect(
      adaptResistance({
        resistance: { type: "percent_1rm", percentage: 80 },
        legacyLoad: "135 lb",
        legacyLoadValue: "135",
        legacyLoadUnit: "lb",
        legacyNormalizedLoadKg: "61.23496995",
      }),
    ).toEqual({
      resistance: { type: "percent_1rm", percentage: 80 },
      normalizedWeightKg: null,
      source: "structured",
    });
  });

  it.each([
    { type: "fixed_weight", value: 135, unit: "lb" },
    { type: "percent_1rm", percentage: 80 },
    { type: "bodyweight" },
    { type: "band", description: "Heavy band" },
    { type: "rpe", target: 7.5 },
    { type: "rir", target: 2 },
    { type: "free_text", description: "Moderate sled" },
  ] as const)("round-trips %j through persistence fields", (resistance) => {
    expect(
      resistanceFromPersistence(resistanceToPersistence(resistance)),
    ).toEqual(resistance);
  });
});
