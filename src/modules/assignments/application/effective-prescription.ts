export interface PrescriptionFields {
  reps: number | null;
  load: string | null;
  loadValue: string | null;
  loadUnit: "kg" | "lb" | null;
  normalizedLoadKg: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export interface PrescriptionOverride extends PrescriptionFields {
  id: string;
}

export interface EffectivePrescription extends PrescriptionFields {
  sourceOverrideId: string | null;
}

export function resolveEffectivePrescription(
  base: PrescriptionFields,
  override: PrescriptionOverride | null,
): EffectivePrescription {
  if (!override) {
    return { ...base, sourceOverrideId: null };
  }

  return {
    reps: override.reps ?? base.reps,
    load: override.load ?? base.load,
    loadValue: override.loadValue ?? base.loadValue,
    loadUnit: override.loadUnit ?? base.loadUnit,
    normalizedLoadKg: override.normalizedLoadKg ?? base.normalizedLoadKg,
    durationSeconds: override.durationSeconds ?? base.durationSeconds,
    distanceMeters: override.distanceMeters ?? base.distanceMeters,
    restSeconds: override.restSeconds ?? base.restSeconds,
    tempo: override.tempo ?? base.tempo,
    notes: override.notes ?? base.notes,
    sourceOverrideId: override.id,
  };
}