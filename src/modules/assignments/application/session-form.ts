import "server-only";

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.floor(numeric);
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
        durationSeconds: result.durationSeconds,
        distanceMeters: result.distanceMeters,
        notes: result.notes,
      };
    })
    .filter(isNonNullable);
}
