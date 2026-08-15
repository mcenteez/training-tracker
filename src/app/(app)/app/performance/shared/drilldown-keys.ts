type DrilldownOccurrenceKeyInput = {
  assignmentId: string;
  athleteUserId: string;
  scheduledDate: string;
  workoutName: string | null;
  label?: string | null;
  sessionId?: string | null;
  dueAt?: Date | null;
};

export function buildOccurrenceRowKey(
  fact: DrilldownOccurrenceKeyInput,
): string {
  return [
    fact.assignmentId,
    fact.athleteUserId,
    fact.scheduledDate,
    fact.workoutName,
    fact.label ?? "",
    fact.sessionId ?? "",
    fact.dueAt ? fact.dueAt.toISOString() : "",
  ].join(":");
}
