import { addDays, compareDates, toLocalDateString } from "./schedule-dates";

export type StrengthLoadUnit = "kg" | "lb";

export type TrainingLoadUnavailableReason =
  | "missing_duration"
  | "missing_rpe"
  | "unmeasurable_external_work"
  | "insufficient_history";

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
  state:
    | "externalWorkUnavailable"
    | "externalWorkPartial"
    | "externalWorkComparable";
  prescribedVolumeKg: number | null;
  completedVolumeKg: number | null;
  completion: number | null;
  prescribedRowCount: number;
  prescribedMeasurableRowCount: number;
  completedRowCount: number;
  completedMeasurableRowCount: number;
  unavailableReason: "unmeasurable_external_work" | null;
}

export interface InternalLoadMetric {
  state: "notCaptured" | "internalLoadAvailable";
  durationMinutes: number | null;
  sessionRpe: number | null;
  internalLoad: number | null;
  sampleCount: number;
  unavailableReasons: Array<"missing_duration" | "missing_rpe">;
}

export interface InternalLoadBaseline {
  state: "insufficient_history" | "available";
  sampleCount: number;
  medianInternalLoad: number | null;
  difference: number | null;
  differencePercent: number | null;
  currentInternalLoad: number | null;
  unavailableReason: TrainingLoadUnavailableReason | null;
  windowStartDate: string | null;
  windowEndDate: string | null;
}

export interface BaselineSessionInput {
  sessionId: string;
  status: "assigned" | "in_progress" | "submitted";
  scheduledAt: Date;
  durationMinutes: number | null;
  sessionRpe: number | null;
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

export function buildInternalLoadMetric(
  durationMinutes: number | null,
  sessionRpe: number | null,
): InternalLoadMetric {
  const internalLoad = calculateInternalLoad(durationMinutes, sessionRpe);
  const unavailableReasons: InternalLoadMetric["unavailableReasons"] = [];
  if (durationMinutes === null) unavailableReasons.push("missing_duration");
  if (sessionRpe === null) unavailableReasons.push("missing_rpe");

  return {
    state: internalLoad === null ? "notCaptured" : "internalLoadAvailable",
    durationMinutes,
    sessionRpe,
    internalLoad,
    sampleCount: internalLoad === null ? 0 : 1,
    unavailableReasons,
  };
}

function summarizeVolume(rows: readonly VolumeInput[]) {
  const measurableRows = rows.filter(
    (row) =>
      row.reps !== null &&
      Number.isInteger(row.reps) &&
      row.reps >= 0 &&
      row.normalizedLoadKg !== null &&
      Number.isFinite(row.normalizedLoadKg) &&
      row.normalizedLoadKg > 0,
  );
  return {
    rowCount: rows.length,
    measurableRowCount: measurableRows.length,
    volumeKg:
      measurableRows.length === 0
        ? null
        : measurableRows.reduce(
            (total, row) => total + row.reps! * row.normalizedLoadKg!,
            0,
          ),
  };
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
  const prescribed = summarizeVolume(input.prescribed);
  const completed = summarizeVolume(input.completed);
  const allRowsMeasurable =
    prescribed.rowCount > 0 &&
    completed.rowCount > 0 &&
    prescribed.measurableRowCount === prescribed.rowCount &&
    completed.measurableRowCount === completed.rowCount;

  if (allRowsMeasurable) {
    return {
      state: "externalWorkComparable",
      prescribedVolumeKg: prescribed.volumeKg,
      completedVolumeKg: completed.volumeKg,
      completion:
        prescribed.volumeKg !== null &&
        completed.volumeKg !== null &&
        prescribed.volumeKg > 0 &&
        completed.volumeKg > 0
          ? completed.volumeKg / prescribed.volumeKg
          : null,
      prescribedRowCount: prescribed.rowCount,
      prescribedMeasurableRowCount: prescribed.measurableRowCount,
      completedRowCount: completed.rowCount,
      completedMeasurableRowCount: completed.measurableRowCount,
      unavailableReason: null,
    };
  }

  const hasAnyMeasurableRows =
    prescribed.measurableRowCount > 0 || completed.measurableRowCount > 0;

  return {
    state: hasAnyMeasurableRows
      ? "externalWorkPartial"
      : "externalWorkUnavailable",
    prescribedVolumeKg: prescribed.volumeKg,
    completedVolumeKg: completed.volumeKg,
    completion: null,
    prescribedRowCount: prescribed.rowCount,
    prescribedMeasurableRowCount: prescribed.measurableRowCount,
    completedRowCount: completed.rowCount,
    completedMeasurableRowCount: completed.measurableRowCount,
    unavailableReason: "unmeasurable_external_work",
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
      currentInternalLoad,
      unavailableReason: "insufficient_history",
      windowStartDate: null,
      windowEndDate: null,
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
    currentInternalLoad,
    unavailableReason: null,
    windowStartDate: null,
    windowEndDate: null,
  };
}

export function buildIndividualInternalLoadBaseline(input: {
  currentSessionId: string;
  currentScheduledAt: Date;
  currentDurationMinutes: number | null;
  currentSessionRpe: number | null;
  timeZone: string;
  sessions: readonly BaselineSessionInput[];
}): InternalLoadBaseline {
  const currentMetric = buildInternalLoadMetric(
    input.currentDurationMinutes,
    input.currentSessionRpe,
  );
  const currentDate = toLocalDateString(
    input.currentScheduledAt,
    input.timeZone,
  );
  const windowStartDate = addDays(currentDate, -28);
  const windowEndDate = addDays(currentDate, -1);
  const precedingInternalLoads = input.sessions.flatMap((session) => {
    if (
      session.sessionId === input.currentSessionId ||
      session.status !== "submitted"
    ) {
      return [];
    }
    const scheduledDate = toLocalDateString(
      session.scheduledAt,
      input.timeZone,
    );
    if (
      compareDates(scheduledDate, windowStartDate) < 0 ||
      compareDates(scheduledDate, currentDate) >= 0
    ) {
      return [];
    }
    const internalLoad = calculateInternalLoad(
      session.durationMinutes,
      session.sessionRpe,
    );
    return internalLoad === null ? [] : [internalLoad];
  });
  const baseline = buildInternalLoadBaseline(
    currentMetric.internalLoad,
    precedingInternalLoads,
  );

  return {
    ...baseline,
    unavailableReason:
      currentMetric.unavailableReasons[0] ?? baseline.unavailableReason,
    windowStartDate,
    windowEndDate,
  };
}
