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
  overriddenFields: readonly PrescriptionOverrideField[];
}

export const prescriptionOverrideFields = [
  "reps",
  "load",
  "durationSeconds",
  "distanceMeters",
  "restSeconds",
  "tempo",
  "notes",
] as const;

export type PrescriptionOverrideField =
  (typeof prescriptionOverrideFields)[number];

export function isPrescriptionOverrideField(
  value: string,
): value is PrescriptionOverrideField {
  return prescriptionOverrideFields.includes(
    value as PrescriptionOverrideField,
  );
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

  const overrides = new Set(override.overriddenFields);

  return {
    reps: overrides.has("reps") ? override.reps : base.reps,
    load: overrides.has("load") ? override.load : base.load,
    loadValue: overrides.has("load") ? override.loadValue : base.loadValue,
    loadUnit: overrides.has("load") ? override.loadUnit : base.loadUnit,
    normalizedLoadKg: overrides.has("load")
      ? override.normalizedLoadKg
      : base.normalizedLoadKg,
    durationSeconds: overrides.has("durationSeconds")
      ? override.durationSeconds
      : base.durationSeconds,
    distanceMeters: overrides.has("distanceMeters")
      ? override.distanceMeters
      : base.distanceMeters,
    restSeconds: overrides.has("restSeconds")
      ? override.restSeconds
      : base.restSeconds,
    tempo: overrides.has("tempo") ? override.tempo : base.tempo,
    notes: overrides.has("notes") ? override.notes : base.notes,
    sourceOverrideId: override.id,
  };
}
