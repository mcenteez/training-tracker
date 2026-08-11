import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  autosaveSessionResultsInputSchema,
  submitSessionResultsInputSchema,
} from "@/modules/assignments/application/assignment-input";
import type {
  AssignmentSession,
  AssignmentSessionItemResult,
} from "@/modules/assignments/db/schema";

interface AssignmentRecipientRecord {
  assignmentId: string;
  recipientId: string;
  sourceType: "plan" | "workout";
  timezone: string;
  scheduledDate: string | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
}

interface WorkoutSnapshotRecord {
  workoutSnapshotId: string;
}

interface AssignmentSessionRecord {
  id: string;
  assignmentId: string;
  athleteUserId: string;
  workoutSnapshotId: string;
  status: AssignmentSession["status"];
  availableFrom: Date;
  availableUntil: Date;
  version: number;
  lastMutationId: string | null;
}

interface AssignmentSessionResultInput {
  itemSnapshotId: string;
  roundNumber: number;
  reps: number | null;
  load: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  notes: string | null;
}

export interface AssignmentSessionTransaction {
  findPublishedRecipientAssignment(
    organizationId: string,
    assignmentId: string,
    athleteUserId: string,
  ): Promise<AssignmentRecipientRecord | null>;
  findPrimaryWorkoutSnapshot(
    organizationId: string,
    assignmentId: string,
  ): Promise<WorkoutSnapshotRecord | null>;
  findSessionForAthlete(
    organizationId: string,
    assignmentId: string,
    athleteUserId: string,
  ): Promise<AssignmentSessionRecord | null>;
  createSession(input: {
    organizationId: string;
    assignmentId: string;
    recipientId: string;
    athleteUserId: string;
    workoutSnapshotId: string;
    scheduledDate: string;
    availableFrom: Date;
    availableUntil: Date;
  }): Promise<AssignmentSession>;
  findSessionByIdForAthlete(
    organizationId: string,
    assignmentId: string,
    sessionId: string,
    athleteUserId: string,
  ): Promise<AssignmentSessionRecord | null>;
  listItemSnapshotIdsForWorkoutSnapshot(input: {
    organizationId: string;
    assignmentId: string;
    workoutSnapshotId: string;
  }): Promise<readonly string[]>;
  replaceSessionResults(input: {
    organizationId: string;
    assignmentId: string;
    sessionId: string;
    results: readonly AssignmentSessionResultInput[];
  }): Promise<void>;
  touchSessionProgress(input: {
    organizationId: string;
    assignmentId: string;
    sessionId: string;
    expectedVersion: number;
    mutationId: string;
  }): Promise<AssignmentSession | null>;
  submitSession(input: {
    organizationId: string;
    assignmentId: string;
    sessionId: string;
    expectedVersion: number;
  }): Promise<AssignmentSession | null>;
  listSessionResults(input: {
    organizationId: string;
    assignmentId: string;
    sessionId: string;
  }): Promise<readonly AssignmentSessionItemResult[]>;
}

export interface AssignmentSessionUnitOfWork {
  transaction<Result>(
    operation: (transaction: AssignmentSessionTransaction) => Promise<Result>,
  ): Promise<Result>;
}

function nowDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10);
}

function localMidnightToUtc(date: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const targetTime = Date.UTC(year!, month! - 1, day!);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidateTime = targetTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidateTime))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const representedTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const adjustment = targetTime - representedTime;

    candidateTime += adjustment;
    if (adjustment === 0) {
      break;
    }
  }

  return new Date(candidateTime);
}

function resolveAvailabilityWindow(input: {
  availableFrom: Date | null;
  availableUntil: Date | null;
  scheduledDate: string | null;
  timezone: string;
  now: Date;
}): { availableFrom: Date; availableUntil: Date } {
  const scheduledDayStart = input.scheduledDate
    ? localMidnightToUtc(input.scheduledDate, input.timezone)
    : null;
  const scheduledDayEnd = input.scheduledDate
    ? new Date(
        localMidnightToUtc(
          addUtcDays(input.scheduledDate, 1),
          input.timezone,
        ).getTime() - 1,
      )
    : null;
  const availableFrom = input.availableFrom ?? scheduledDayStart ?? input.now;
  const availableUntil =
    input.availableUntil ??
    scheduledDayEnd ??
    new Date(availableFrom.getTime() + 24 * 60 * 60 * 1000);

  if (availableUntil <= availableFrom) {
    throw new DomainInvariantError(
      "Assignment availability window is invalid.",
    );
  }

  return { availableFrom, availableUntil };
}

function assertSessionWindow(
  session: AssignmentSessionRecord,
  now: Date,
): void {
  if (now < session.availableFrom || now > session.availableUntil) {
    throw new DomainInvariantError(
      "This session is outside its availability window.",
    );
  }
}

export async function startAssignmentSession(
  unitOfWork: AssignmentSessionUnitOfWork,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
    now?: Date;
  },
): Promise<AssignmentSession> {
  return unitOfWork.transaction(async (transaction) => {
    const now = input.now ?? new Date();
    const assignment = await transaction.findPublishedRecipientAssignment(
      input.organizationId,
      input.assignmentId,
      input.athleteUserId,
    );

    if (!assignment) {
      throw new AuthorizationError();
    }

    const existingSession = await transaction.findSessionForAthlete(
      input.organizationId,
      input.assignmentId,
      input.athleteUserId,
    );

    if (existingSession) {
      if (existingSession.status === "submitted") {
        throw new DomainInvariantError(
          "This assignment session is already submitted.",
        );
      }

      assertSessionWindow(existingSession, now);
      const existing = await transaction.findSessionByIdForAthlete(
        input.organizationId,
        input.assignmentId,
        existingSession.id,
        input.athleteUserId,
      );

      if (!existing) {
        throw new ResourceNotFoundError("Assignment session");
      }

      return existing as AssignmentSession;
    }

    const primaryWorkoutSnapshot = await transaction.findPrimaryWorkoutSnapshot(
      input.organizationId,
      input.assignmentId,
    );

    if (!primaryWorkoutSnapshot) {
      throw new DomainInvariantError(
        "This assignment does not have workout snapshots yet.",
      );
    }

    const availability = resolveAvailabilityWindow({
      availableFrom: assignment.availableFrom,
      availableUntil: assignment.availableUntil,
      scheduledDate: assignment.scheduledDate,
      timezone: assignment.timezone,
      now,
    });

    if (now < availability.availableFrom || now > availability.availableUntil) {
      throw new DomainInvariantError(
        "This assignment is not currently available to start.",
      );
    }

    return transaction.createSession({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      recipientId: assignment.recipientId,
      athleteUserId: input.athleteUserId,
      workoutSnapshotId: primaryWorkoutSnapshot.workoutSnapshotId,
      scheduledDate: assignment.scheduledDate ?? nowDateOnly(now),
      availableFrom: availability.availableFrom,
      availableUntil: availability.availableUntil,
    });
  });
}

export async function autosaveAssignmentSessionResults(
  unitOfWork: AssignmentSessionUnitOfWork,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
    sessionId: string;
    expectedVersion: number;
    mutationId: string;
    results: readonly AssignmentSessionResultInput[];
  },
): Promise<AssignmentSession> {
  const parsed = autosaveSessionResultsInputSchema.parse({
    sessionId: input.sessionId,
    expectedVersion: input.expectedVersion,
    mutationId: input.mutationId,
    results: input.results,
  });

  return unitOfWork.transaction(async (transaction) => {
    const session = await transaction.findSessionByIdForAthlete(
      input.organizationId,
      input.assignmentId,
      parsed.sessionId,
      input.athleteUserId,
    );

    if (!session) {
      throw new AuthorizationError();
    }

    if (session.status === "submitted") {
      throw new DomainInvariantError("Submitted sessions cannot be edited.");
    }

    if (session.version !== parsed.expectedVersion) {
      throw new DomainInvariantError(
        "This session was updated elsewhere. Reload and try again.",
      );
    }

    if (session.lastMutationId === parsed.mutationId) {
      const current = await transaction.findSessionByIdForAthlete(
        input.organizationId,
        input.assignmentId,
        parsed.sessionId,
        input.athleteUserId,
      );

      if (!current) {
        throw new ResourceNotFoundError("Assignment session");
      }

      return current as AssignmentSession;
    }

    assertSessionWindow(session, new Date());

    const allowedItemSnapshotIds = new Set(
      await transaction.listItemSnapshotIdsForWorkoutSnapshot({
        organizationId: input.organizationId,
        assignmentId: input.assignmentId,
        workoutSnapshotId: session.workoutSnapshotId,
      }),
    );

    for (const result of parsed.results) {
      if (!allowedItemSnapshotIds.has(result.itemSnapshotId)) {
        throw new DomainInvariantError(
          "Session result includes an item not assigned to this workout.",
        );
      }
    }

    await transaction.replaceSessionResults({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: parsed.sessionId,
      results: parsed.results,
    });

    const updated = await transaction.touchSessionProgress({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: parsed.sessionId,
      expectedVersion: parsed.expectedVersion,
      mutationId: parsed.mutationId,
    });

    if (!updated) {
      throw new DomainInvariantError(
        "This session was updated elsewhere. Reload and try again.",
      );
    }

    return updated;
  });
}

export async function submitAssignmentSession(
  unitOfWork: AssignmentSessionUnitOfWork,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
    sessionId: string;
    expectedVersion: number;
  },
): Promise<AssignmentSession> {
  const parsed = submitSessionResultsInputSchema.parse({
    sessionId: input.sessionId,
    expectedVersion: input.expectedVersion,
  });

  return unitOfWork.transaction(async (transaction) => {
    const session = await transaction.findSessionByIdForAthlete(
      input.organizationId,
      input.assignmentId,
      parsed.sessionId,
      input.athleteUserId,
    );

    if (!session) {
      throw new AuthorizationError();
    }

    if (session.status === "submitted") {
      throw new DomainInvariantError("This session is already submitted.");
    }

    if (session.version !== parsed.expectedVersion) {
      throw new DomainInvariantError(
        "This session was updated elsewhere. Reload and try again.",
      );
    }

    assertSessionWindow(session, new Date());

    const existingResults = await transaction.listSessionResults({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: parsed.sessionId,
    });

    if (existingResults.length === 0) {
      throw new DomainInvariantError(
        "Record at least one result before submitting.",
      );
    }

    const submitted = await transaction.submitSession({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: parsed.sessionId,
      expectedVersion: parsed.expectedVersion,
    });

    if (!submitted) {
      throw new DomainInvariantError(
        "This session was updated elsewhere. Reload and try again.",
      );
    }

    return submitted;
  });
}
