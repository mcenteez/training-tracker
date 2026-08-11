import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  autosaveSessionResultsInputSchema,
  submitSessionResultsInputSchema,
} from "@/modules/assignments/application/assignment-input";
import {
  compareDates,
  currentWeekWindow,
  listFixedDayDates,
  toLocalDateString,
  weekdayOf,
} from "@/modules/assignments/application/schedule-dates";
import type {
  AssignmentSession,
  AssignmentSessionItemResult,
} from "@/modules/assignments/db/schema";
import type { PlanDayOfWeek } from "@/modules/plans/db/schema";

interface AssignmentRecipientRecord {
  assignmentId: string;
  recipientId: string;
  sourceType: "plan" | "workout";
  status: "published" | "canceled";
  timezone: string;
  scheduledDate: string | null;
  startDate: string | null;
  endDate: string | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
}

interface WorkoutSnapshotRecord {
  workoutSnapshotId: string;
}

interface PlanSlotSnapshotRecord {
  id: string;
  workoutSnapshotId: string;
  scheduleType: "fixed_day" | "weekly_frequency";
  dayOfWeek: PlanDayOfWeek | null;
  targetSessionsPerWeek: number | null;
}

interface AthleteSessionOccurrenceRecord {
  id: string;
  planSlotSnapshotId: string | null;
  workoutSnapshotId: string;
  scheduledDate: string;
  status: AssignmentSession["status"];
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
  completedAt: Date;
  roundNumber: number;
  reps: number | null;
  load: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  notes: string | null;
}

export interface AssignmentSessionTransaction {
  findRecipientAssignment(
    organizationId: string,
    assignmentId: string,
    athleteUserId: string,
  ): Promise<AssignmentRecipientRecord | null>;
  findPrimaryWorkoutSnapshot(
    organizationId: string,
    assignmentId: string,
  ): Promise<WorkoutSnapshotRecord | null>;
  listPlanSlotSnapshots(
    organizationId: string,
    assignmentId: string,
  ): Promise<readonly PlanSlotSnapshotRecord[]>;
  lockPlanSlotForAthlete(input: {
    planSlotSnapshotId: string;
    athleteUserId: string;
  }): Promise<void>;
  listAthleteSessions(
    organizationId: string,
    assignmentId: string,
    athleteUserId: string,
  ): Promise<readonly AthleteSessionOccurrenceRecord[]>;
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
    planSlotSnapshotId: string | null;
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
  resetSession(input: {
    organizationId: string;
    assignmentId: string;
    sessionId: string;
    expectedVersion: number;
  }): Promise<AssignmentSession | null>;
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
    planSlotSnapshotId?: string | null;
    scheduledDate?: string | null;
    now?: Date;
  },
): Promise<AssignmentSession> {
  return unitOfWork.transaction(async (transaction) => {
    const now = input.now ?? new Date();
    const assignment = await transaction.findRecipientAssignment(
      input.organizationId,
      input.assignmentId,
      input.athleteUserId,
    );

    if (!assignment) {
      throw new AuthorizationError();
    }

    if (assignment.sourceType === "plan") {
      return startPlanOccurrenceSession(transaction, {
        ...input,
        assignment,
        now,
      });
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

    if (assignment.status !== "published") {
      throw new DomainInvariantError(
        "Canceled assignments cannot start new sessions.",
      );
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
      planSlotSnapshotId: null,
      scheduledDate: assignment.scheduledDate ?? nowDateOnly(now),
      availableFrom: availability.availableFrom,
      availableUntil: availability.availableUntil,
    });
  });
}

async function startPlanOccurrenceSession(
  transaction: AssignmentSessionTransaction,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
    planSlotSnapshotId?: string | null;
    scheduledDate?: string | null;
    assignment: AssignmentRecipientRecord;
    now: Date;
  },
): Promise<AssignmentSession> {
  const { assignment, now } = input;

  if (!input.planSlotSnapshotId) {
    throw new DomainInvariantError(
      "Choose a plan workout before starting a session.",
    );
  }

  if (!assignment.startDate || !assignment.endDate) {
    throw new DomainInvariantError(
      "This plan assignment is missing its date range.",
    );
  }

  const slots = await transaction.listPlanSlotSnapshots(
    input.organizationId,
    input.assignmentId,
  );
  const slot = slots.find(
    (candidate) => candidate.id === input.planSlotSnapshotId,
  );

  if (!slot) {
    throw new ResourceNotFoundError("Plan workout");
  }

  const today = toLocalDateString(now, assignment.timezone);
  const { weekStart, weekEnd } = currentWeekWindow(now, assignment.timezone);
  const scheduledDate = input.scheduledDate ?? today;

  if (
    compareDates(scheduledDate, assignment.startDate) < 0 ||
    compareDates(scheduledDate, assignment.endDate) > 0
  ) {
    throw new DomainInvariantError(
      "This workout date is outside the assignment schedule.",
    );
  }

  if (slot.scheduleType === "fixed_day") {
    if (!slot.dayOfWeek || weekdayOf(scheduledDate) !== slot.dayOfWeek) {
      throw new DomainInvariantError(
        "This workout is scheduled for a different day of the week.",
      );
    }

    const eligibleDates = listFixedDayDates({
      dayOfWeek: slot.dayOfWeek,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
    });

    if (!eligibleDates.includes(scheduledDate)) {
      throw new DomainInvariantError(
        "This workout date is outside the assignment schedule.",
      );
    }

    if (compareDates(scheduledDate, today) > 0) {
      throw new DomainInvariantError(
        "This workout is not available to start yet.",
      );
    }
  } else {
    if (
      compareDates(scheduledDate, weekStart) < 0 ||
      compareDates(scheduledDate, weekEnd) > 0 ||
      compareDates(scheduledDate, today) > 0
    ) {
      throw new DomainInvariantError(
        "Flexible workouts can only be started during the current week.",
      );
    }
  }

  const sessions = await transaction.listAthleteSessions(
    input.organizationId,
    input.assignmentId,
    input.athleteUserId,
  );
  const existing = sessions.find(
    (session) =>
      session.planSlotSnapshotId === slot.id &&
      session.scheduledDate === scheduledDate,
  );

  if (existing) {
    if (existing.status === "submitted") {
      throw new DomainInvariantError(
        "This assignment session is already submitted.",
      );
    }

    const record = await transaction.findSessionByIdForAthlete(
      input.organizationId,
      input.assignmentId,
      existing.id,
      input.athleteUserId,
    );

    if (!record) {
      throw new ResourceNotFoundError("Assignment session");
    }

    return record as AssignmentSession;
  }

  if (assignment.status !== "published") {
    throw new DomainInvariantError(
      "Canceled assignments cannot start new sessions.",
    );
  }

  if (slot.scheduleType === "weekly_frequency") {
    await transaction.lockPlanSlotForAthlete({
      planSlotSnapshotId: slot.id,
      athleteUserId: input.athleteUserId,
    });

    const target = slot.targetSessionsPerWeek ?? 1;
    const lockedSessions = await transaction.listAthleteSessions(
      input.organizationId,
      input.assignmentId,
      input.athleteUserId,
    );
    const countedThisWeek = lockedSessions.filter(
      (session) =>
        session.planSlotSnapshotId === slot.id &&
        compareDates(session.scheduledDate, weekStart) >= 0 &&
        compareDates(session.scheduledDate, weekEnd) <= 0,
    ).length;

    if (countedThisWeek >= target) {
      throw new DomainInvariantError(
        "The weekly target for this workout is already met.",
      );
    }
  }

  const availability = resolveAvailabilityWindow({
    availableFrom: null,
    availableUntil: null,
    scheduledDate,
    timezone: assignment.timezone,
    now,
  });

  return transaction.createSession({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
    recipientId: assignment.recipientId,
    athleteUserId: input.athleteUserId,
    workoutSnapshotId: slot.workoutSnapshotId,
    planSlotSnapshotId: slot.id,
    scheduledDate,
    availableFrom: availability.availableFrom,
    availableUntil: availability.availableUntil,
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
    now?: Date;
  },
): Promise<AssignmentSession> {
  const parsed = autosaveSessionResultsInputSchema.parse({
    sessionId: input.sessionId,
    expectedVersion: input.expectedVersion,
    mutationId: input.mutationId,
    results: input.results,
  });

  return unitOfWork.transaction(async (transaction) => {
    const now = input.now ?? new Date();
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

    assertSessionWindow(session, now);

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

export async function resetAssignmentSession(
  unitOfWork: AssignmentSessionUnitOfWork,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
    sessionId: string;
    expectedVersion: number;
    now?: Date;
  },
): Promise<AssignmentSession> {
  return unitOfWork.transaction(async (transaction) => {
    const now = input.now ?? new Date();
    const session = await transaction.findSessionByIdForAthlete(
      input.organizationId,
      input.assignmentId,
      input.sessionId,
      input.athleteUserId,
    );

    if (!session) {
      throw new AuthorizationError();
    }

    if (session.status === "submitted") {
      throw new DomainInvariantError("Submitted sessions cannot be reset.");
    }

    if (session.version !== input.expectedVersion) {
      throw new DomainInvariantError(
        "This session was updated elsewhere. Reload and try again.",
      );
    }

    assertSessionWindow(session, now);

    const reset = await transaction.resetSession({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: input.sessionId,
      expectedVersion: input.expectedVersion,
    });

    if (!reset) {
      throw new DomainInvariantError(
        "This session was updated elsewhere. Reload and try again.",
      );
    }

    return reset;
  });
}
