import { describe, expect, it } from "vitest";

import { resolveEffectivePrescription } from "./effective-prescription";

const base = {
  reps: 10,
  load: "135 lb",
  loadValue: "135",
  loadUnit: "lb" as const,
  normalizedLoadKg: "61.23496995",
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: 120,
  tempo: "31X1",
  notes: "Controlled descent",
};

describe("resolveEffectivePrescription", () => {
  it("returns the shared item snapshot when no athlete override exists", () => {
    expect(resolveEffectivePrescription(base, null)).toEqual({
      ...base,
      sourceOverrideId: null,
    });
  });

  it("overrides only supplied athlete-specific fields", () => {
    expect(
      resolveEffectivePrescription(base, {
        id: "override-1",
        overriddenFields: ["reps", "notes"],
        reps: 20,
        load: null,
        loadValue: null,
        loadUnit: null,
        normalizedLoadKg: null,
        durationSeconds: null,
        distanceMeters: null,
        restSeconds: null,
        tempo: null,
        notes: "Extra volume",
      }),
    ).toEqual({
      ...base,
      reps: 20,
      notes: "Extra volume",
      sourceOverrideId: "override-1",
    });
  });

  it("allows an override to intentionally clear one prescribed field", () => {
    expect(
      resolveEffectivePrescription(base, {
        id: "override-2",
        overriddenFields: ["load"],
        reps: null,
        load: null,
        loadValue: null,
        loadUnit: null,
        normalizedLoadKg: null,
        durationSeconds: null,
        distanceMeters: null,
        restSeconds: null,
        tempo: null,
        notes: null,
      }),
    ).toMatchObject({
      reps: 10,
      load: null,
      loadValue: null,
      loadUnit: null,
      normalizedLoadKg: null,
      sourceOverrideId: "override-2",
    });
  });

  it("resolves every supported field from an individual prescription", () => {
    expect(
      resolveEffectivePrescription(base, {
        id: "override-all",
        overriddenFields: [
          "reps",
          "load",
          "durationSeconds",
          "distanceMeters",
          "restSeconds",
          "tempo",
          "notes",
        ],
        reps: 8,
        load: "100 kg",
        loadValue: "100",
        loadUnit: "kg",
        normalizedLoadKg: "100",
        durationSeconds: 60,
        distanceMeters: 400,
        restSeconds: 90,
        tempo: "20X1",
        notes: "Individualized",
      }),
    ).toEqual({
      reps: 8,
      load: "100 kg",
      loadValue: "100",
      loadUnit: "kg",
      normalizedLoadKg: "100",
      durationSeconds: 60,
      distanceMeters: 400,
      restSeconds: 90,
      tempo: "20X1",
      notes: "Individualized",
      sourceOverrideId: "override-all",
    });
  });
});
