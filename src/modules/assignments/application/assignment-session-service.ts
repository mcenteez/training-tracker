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
  addDays,
  compareDates,
  listFixedDayDates,
  mondayOf,
  toLocalDateString,
  weekdayOf,
} from "@/modules/assignments/application/schedule-dates";
import {
  resolveLateEntryUntil,
  resolveLocalDateTimeAtMinute,
  resolveOccurrenceDueAt,
  type TimelinessPolicy,
} from "@/modules/assignments/application/timeliness-policy";
import type {
  AssignmentSession,
  AssignmentSessionItemResult,
} from "@/modules/assignments/db/schema";
import type { PlanDayOfWeek } from "@/modules/plans/db/schema";
import { normalizeStrengthLoad } from "./training-load";

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
  timelinessPolicyVersion?: number;
  timelinessPolicyEffectiveAt?: Date;
  fixedDueLocalMinute?: number;
  weeklyDueDay?: number;
  weeklyDueLocalMinute?: number;
  lateEntryDays?: number;
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
  dueAt: Date | null;
  version: number;
  lastMutationId: string | null;
}

interface AssignmentSessionResultInput {
  itemSnapshotId: string;
  completedAt: Date;
  roundNumber: number;
  reps: number | null;
  load: string | null;
  loadValue?: number | null;
  loadUnit?: "kg" | "lb" | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  notes: string | null;
}

interface PersistedAssignmentSessionResultInput extends Omit<
  AssignmentSessionResultInput,
  "loadValue"
> {
  loadValue: string | null;
  loadUnit: "kg" | "lb" | null;
  normalizedLoadKg: string | null;
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
    dueAt: Date | null;
  }): Promise<AssignmentSession>;
  snapshotEffectiveItemPrescriptions(input: {
    organizationId: string;
    assignmentId: string;
    recipientId: string;
    athleteUserId: string;
    sessionId: string;
    workoutSnapshotId: string;
    planSlotSnapshotId: string | null;
  }): Promise<void>;
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
    results: readonly PersistedAssignmentSessionResultInput[];
  }): Promise<void>;
  touchSessionProgress(input: {
    organizationId: string;
    assignmentId: string;
    sessionId: string;
    expectedVersion: number;
    mutationId: string;
    durationMinutes: number | null;
    sessionRpe: number | null;
    preserveSubmitted?: boolean;
  }): Promise<AssignmentSession | null>;
  submitSession(input: {
    organizationId: string;
    assignmentId: string;
    sessionId: string;
    expectedVersion: number;
    submittedAt: Date;
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

function resolveAvailabilityWindow(input: {
  availableFrom: Date | null;
  availableUntil: Date | null;
  scheduledDate: string;
  scheduleType: "fixed" | "weekly_frequency";
  timezone: string;
  policy: TimelinessPolicy;
}): { availableFrom: Date; availableUntil: Date; dueAt: Date | null } {
  const availableFrom =
    input.availableFrom ??
    resolveLocalDateTimeAtMinute(input.scheduledDate, 0, input.timezone);
  const resolvedDueAt = resolveOccurrenceDueAt({
    scheduledDate: input.scheduledDate,
    scheduleType: input.scheduleType,
    timezone: input.timezone,
    policy: input.policy,
  });
  const dueAt =
    resolvedDueAt && resolvedDueAt >= input.policy.effectiveAt
      ? resolvedDueAt
      : null;
  const policyAvailableUntil = dueAt
    ? resolveLateEntryUntil({
        dueAt,
        timezone: input.timezone,
        lateEntryDays: input.policy.lateEntryDays,
      })
    : new Date(resolvedDueAt!.getTime() - 1);
  const availableUntil =
    input.availableUntil && input.availableUntil < policyAvailableUntil
      ? input.availableUntil
      : policyAvailableUntil;

  if (availableUntil <= availableFrom) {
    throw new DomainInvariantError(
      "Assignment availability window is invalid.",
    );
  }

  return { availableFrom, availableUntil, dueAt };
}

function timelinessPolicy(
  assignment: AssignmentRecipientRecord,
): TimelinessPolicy {
  return {
    version: 1,
    effectiveAt: assignment.timelinessPolicyEffectiveAt ?? new Date(0),
    fixedDueLocalMinute: assignment.fixedDueLocalMinute ?? 1440,
    weeklyDueDay: assignment.weeklyDueDay ?? 7,
    weeklyDueLocalMinute: assignment.weeklyDueLocalMinute ?? 1440,
    lateEntryDays: assignment.lateEntryDays ?? 7,
  };
}

function assertSessionWindow(
  session: AssignmentSessionRecord,
  now: Date,
): void {
  if (now < session.availableFrom || now >= session.availableUntil) {
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

    const scheduledDate = assignment.scheduledDate ?? nowDateOnly(now);
    const availability = resolveAvailabilityWindow({
      availableFrom: assignment.availableFrom,
      availableUntil: assignment.availableUntil,
      scheduledDate,
      scheduleType: "fixed",
      timezone: assignment.timezone,
      policy: timelinessPolicy(assignment),
    });

    if (now < availability.availableFrom) {
      throw new DomainInvariantError(
        "This assignment is not currently available to start.",
      );
    }
    if (now >= availability.availableUntil) {
      throw new DomainInvariantError(
        "This assignment's late-entry window has closed.",
      );
    }

    return createSessionWithEffectivePrescriptions(transaction, {
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      recipientId: assignment.recipientId,
      athleteUserId: input.athleteUserId,
      workoutSnapshotId: primaryWorkoutSnapshot.workoutSnapshotId,
      planSlotSnapshotId: null,
      scheduledDate,
      availableFrom: availability.availableFrom,
      availableUntil: availability.availableUntil,
      dueAt: availability.dueAt,
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
  const scheduledDate = input.scheduledDate ?? today;
  const occurrenceWeekStart = mondayOf(scheduledDate);
  const occurrenceWeekEnd = addDays(occurrenceWeekStart, 6);

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
    if (compareDates(scheduledDate, today) > 0) {
      throw new DomainInvariantError(
        "Flexible workouts cannot be started before their occurrence date.",
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
        compareDates(session.scheduledDate, occurrenceWeekStart) >= 0 &&
        compareDates(session.scheduledDate, occurrenceWeekEnd) <= 0,
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
    scheduleType:
      slot.scheduleType === "weekly_frequency" ? "weekly_frequency" : "fixed",
    timezone: assignment.timezone,
    policy: timelinessPolicy(assignment),
  });

  if (now < availability.availableFrom || now >= availability.availableUntil) {
    throw new DomainInvariantError(
      "This occurrence is outside its late-entry window.",
    );
  }

  return createSessionWithEffectivePrescriptions(transaction, {
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
    recipientId: assignment.recipientId,
    athleteUserId: input.athleteUserId,
    workoutSnapshotId: slot.workoutSnapshotId,
    planSlotSnapshotId: slot.id,
    scheduledDate,
    availableFrom: availability.availableFrom,
    availableUntil: availability.availableUntil,
    dueAt: availability.dueAt,
  });
}

async function createSessionWithEffectivePrescriptions(
  transaction: AssignmentSessionTransaction,
  input: {
    organizationId: string;
    assignmentId: string;
    recipientId: string;
    athleteUserId: string;
    workoutSnapshotId: string;
    planSlotSnapshotId: string | null;
    scheduledDate: string;
    availableFrom: Date;
    availableUntil: Date;
    dueAt: Date | null;
  },
): Promise<AssignmentSession> {
  const session = await transaction.createSession(input);

  await transaction.snapshotEffectiveItemPrescriptions({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
    recipientId: input.recipientId,
    athleteUserId: input.athleteUserId,
    sessionId: session.id,
    workoutSnapshotId: input.workoutSnapshotId,
    planSlotSnapshotId: input.planSlotSnapshotId,
  });

  return session;
}

export async function autosaveAssignmentSessionResults(
  unitOfWork: AssignmentSessionUnitOfWork,
  input: {
    organizationId: string;
    assignmentId: string;
    athleteUserId: string;
    sessionId: string;
    expectedVersion: number;
    now?: Date;
    mutationId: string;
    results: readonly AssignmentSessionResultInput[];
    durationMinutes?: number | null;
    sessionRpe?: number | null;
    allowSubmittedEdit?: boolean;
  },
): Promise<AssignmentSession> {
  const parsed = autosaveSessionResultsInputSchema.parse({
    sessionId: input.sessionId,
    expectedVersion: input.expectedVersion,
    mutationId: input.mutationId,
    durationMinutes: input.durationMinutes ?? null,
    sessionRpe: input.sessionRpe ?? null,
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

    if (session.status === "submitted" && !input.allowSubmittedEdit) {
      throw new DomainInvariantError("Submitted sessions cannot be edited.");
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

    if (session.version !== parsed.expectedVersion) {
      throw new DomainInvariantError(
        "This session was updated elsewhere. Reload and try again.",
      );
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

    const normalizedResults = parsed.results.map((result) => {
      const normalizedLoad =
        result.loadValue != null && result.loadUnit != null
          ? normalizeStrengthLoad({
              value: result.loadValue,
              unit: result.loadUnit,
            })
          : null;

      return {
        ...result,
        load:
          normalizedLoad === null
            ? result.load
            : `${normalizedLoad.value} ${normalizedLoad.unit}`,
        loadValue: normalizedLoad?.value.toString() ?? null,
        loadUnit: normalizedLoad?.unit ?? null,
        normalizedLoadKg: normalizedLoad?.normalizedKg.toString() ?? null,
      };
    });

    await transaction.replaceSessionResults({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: parsed.sessionId,
      results: normalizedResults,
    });

    const updated = await transaction.touchSessionProgress({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: parsed.sessionId,
      expectedVersion: parsed.expectedVersion,
      mutationId: parsed.mutationId,
      durationMinutes: parsed.durationMinutes ?? null,
      sessionRpe: parsed.sessionRpe ?? null,
      preserveSubmitted: input.allowSubmittedEdit,
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
    now?: Date;
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

    const now = input.now ?? new Date();
    assertSessionWindow(session, now);

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
      submittedAt: now,
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
