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
});