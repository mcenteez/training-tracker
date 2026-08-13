import "server-only";

import { DomainInvariantError } from "@/modules/access-control/errors";

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new DomainInvariantError("Enter a valid whole number.");
  }

  return numeric;
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric)) {
    throw new DomainInvariantError("Enter a valid numeric load.");
  }
  return numeric;
}

function parseOptionalLoadUnit(
  value: FormDataEntryValue | null,
): "kg" | "lb" | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value !== "kg" && value !== "lb") {
    throw new DomainInvariantError("Choose kilograms or pounds.");
  }
  return value;
}

function parseOptionalDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalText(
  value: FormDataEntryValue | null,
  maxLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null;
}

export function parseAssignmentSessionResults(formData: FormData) {
  const itemSnapshotIds = formData
    .getAll("itemSnapshotIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  return itemSnapshotIds
    .map((itemSnapshotId) => ({
      itemSnapshotId,
      roundNumber: 1,
      complete: formData.get(`result:${itemSnapshotId}:complete`) !== null,
      completedAt: parseOptionalDate(
        formData.get(`result:${itemSnapshotId}:completedAt`),
      ),
      reps: parseOptionalInt(formData.get(`result:${itemSnapshotId}:reps`)),
      load: parseOptionalText(
        formData.get(`result:${itemSnapshotId}:load`),
        80,
      ),
      loadValue: parseOptionalNumber(
        formData.get(`result:${itemSnapshotId}:loadValue`),
      ),
      loadUnit: parseOptionalLoadUnit(
        formData.get(`result:${itemSnapshotId}:loadUnit`),
      ),
      durationSeconds: parseOptionalInt(
        formData.get(`result:${itemSnapshotId}:durationSeconds`),
      ),
      distanceMeters: parseOptionalInt(
        formData.get(`result:${itemSnapshotId}:distanceMeters`),
      ),
      notes: parseOptionalText(
        formData.get(`result:${itemSnapshotId}:notes`),
        2000,
      ),
    }))
    .map((result) => {
      const hasPayload =
        result.complete ||
        result.completedAt !== null ||
        result.reps !== null ||
        result.load !== null ||
        result.loadValue !== null ||
        result.loadUnit !== null ||
        result.durationSeconds !== null ||
        result.distanceMeters !== null ||
        result.notes !== null;

      if (!hasPayload) {
        return null;
      }

      return {
        itemSnapshotId: result.itemSnapshotId,
        completedAt: result.completedAt ?? new Date(),
        roundNumber: result.roundNumber,
        reps: result.reps,
        load: result.load,
        loadValue: result.loadValue,
        loadUnit: result.loadUnit,
        durationSeconds: result.durationSeconds,
        distanceMeters: result.distanceMeters,
        notes: result.notes,
      };
    })
    .filter(isNonNullable);
}

export function parseAssignmentSessionCapture(formData: FormData) {
  return {
    durationMinutes: parseOptionalInt(formData.get("durationMinutes")),
    sessionRpe: parseOptionalInt(formData.get("sessionRpe")),
    hasSessionResponseFields:
      formData.has("durationMinutes") || formData.has("sessionRpe"),
    results: parseAssignmentSessionResults(formData),
  };
}
