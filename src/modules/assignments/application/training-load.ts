export type StrengthLoadUnit = "kg" | "lb";

export interface StructuredStrengthLoad {
  value: number;
  unit: StrengthLoadUnit;
}

export interface NormalizedStrengthLoad extends StructuredStrengthLoad {
  normalizedKg: number;
}

export interface VolumeInput {
  reps: number | null;
  normalizedLoadKg: number | null;
}

export interface ExternalWorkComparison {
  state: "unavailable" | "partial" | "comparable";
  prescribedVolumeKg: number | null;
  completedVolumeKg: number | null;
  completion: number | null;
}

export interface InternalLoadBaseline {
  state: "insufficient_history" | "available";
  sampleCount: number;
  medianInternalLoad: number | null;
  difference: number | null;
  differencePercent: number | null;
}

const POUNDS_TO_KILOGRAMS = 0.45359237;

export function normalizeStrengthLoad(
  load: StructuredStrengthLoad | null,
): NormalizedStrengthLoad | null {
  if (!load || !Number.isFinite(load.value) || load.value <= 0) return null;

  return {
    ...load,
    normalizedKg:
      load.unit === "lb" ? load.value * POUNDS_TO_KILOGRAMS : load.value,
  };
}

export function calculateInternalLoad(
  durationMinutes: number | null,
  sessionRpe: number | null,
): number | null {
  if (
    durationMinutes === null ||
    sessionRpe === null ||
    !Number.isInteger(durationMinutes) ||
    !Number.isInteger(sessionRpe) ||
    durationMinutes < 0 ||
    sessionRpe < 1 ||
    sessionRpe > 10
  ) {
    return null;
  }

  return durationMinutes * sessionRpe;
}

export function calculateStrengthVolumeKg(
  rows: readonly VolumeInput[],
): number | null {
  if (rows.length === 0) return null;
  if (
    rows.some(
      (row) =>
        row.reps === null ||
        row.normalizedLoadKg === null ||
        !Number.isInteger(row.reps) ||
        row.reps < 0 ||
        row.normalizedLoadKg <= 0,
    )
  ) {
    return null;
  }

  return rows.reduce(
    (total, row) => total + row.reps! * row.normalizedLoadKg!,
    0,
  );
}

export function compareExternalWork(input: {
  prescribed: readonly VolumeInput[];
  completed: readonly VolumeInput[];
}): ExternalWorkComparison {
  const prescribedVolumeKg = calculateStrengthVolumeKg(input.prescribed);
  const completedVolumeKg = calculateStrengthVolumeKg(input.completed);

  if (prescribedVolumeKg !== null && completedVolumeKg !== null) {
    return {
      state: "comparable",
      prescribedVolumeKg,
      completedVolumeKg,
      completion:
        prescribedVolumeKg > 0 ? completedVolumeKg / prescribedVolumeKg : null,
    };
  }

  const hasAnyMeasurableRows =
    input.prescribed.some(
      (row) => row.reps !== null && row.normalizedLoadKg !== null,
    ) ||
    input.completed.some(
      (row) => row.reps !== null && row.normalizedLoadKg !== null,
    );

  return {
    state: hasAnyMeasurableRows ? "partial" : "unavailable",
    prescribedVolumeKg,
    completedVolumeKg,
    completion: null,
  };
}

export function buildInternalLoadBaseline(
  currentInternalLoad: number | null,
  precedingInternalLoads: readonly number[],
): InternalLoadBaseline {
  const eligible = precedingInternalLoads
    .filter((value) => Number.isFinite(value) && value >= 0)
    .toSorted((left, right) => left - right);

  if (currentInternalLoad === null || eligible.length < 3) {
    return {
      state: "insufficient_history",
      sampleCount: eligible.length,
      medianInternalLoad: null,
      difference: null,
      differencePercent: null,
    };
  }

  const midpoint = Math.floor(eligible.length / 2);
  const medianInternalLoad =
    eligible.length % 2 === 0
      ? (eligible[midpoint - 1]! + eligible[midpoint]!) / 2
      : eligible[midpoint]!;
  const difference = currentInternalLoad - medianInternalLoad;

  return {
    state: "available",
    sampleCount: eligible.length,
    medianInternalLoad,
    difference,
    differencePercent:
      medianInternalLoad > 0 ? difference / medianInternalLoad : null,
  };
}
