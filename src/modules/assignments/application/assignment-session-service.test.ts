import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import type {
  AssignmentSession,
  AssignmentSessionItemResult,
} from "@/modules/assignments/db/schema";

import {
  autosaveAssignmentSessionResults,
  resetAssignmentSession,
  startAssignmentSession,
  submitAssignmentSession,
  type AssignmentSessionTransaction,
  type AssignmentSessionUnitOfWork,
} from "./assignment-session-service";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  assignmentId: "22222222-2222-4222-8222-222222222222",
  athleteUserId: "33333333-3333-4333-8333-333333333333",
  recipientId: "44444444-4444-4444-8444-444444444444",
  sessionId: "55555555-5555-4555-8555-555555555555",
  workoutSnapshotId: "66666666-6666-4666-8666-666666666666",
  itemSnapshotId: "77777777-7777-4777-8777-777777777777",
  mutationId: "88888888-8888-4888-8888-888888888888",
};

const now = new Date("2026-08-11T15:00:00.000Z");

function makeSession(
  overrides: Partial<AssignmentSession> = {},
): AssignmentSession {
  return {
    id: ids.sessionId,
    organizationId: ids.organizationId,
    assignmentId: ids.assignmentId,
    recipientId: ids.recipientId,
    athleteUserId: ids.athleteUserId,
    workoutSnapshotId: ids.workoutSnapshotId,
    planSlotSnapshotId: null,
    scheduledDate: "2026-08-11",
    availableFrom: new Date("2026-08-11T12:00:00.000Z"),
    availableUntil: new Date("2026-08-11T18:00:00.000Z"),
    status: "assigned",
    startedAt: null,
    submittedAt: null,
    version: 1,
    lastMutationId: null,
    createdAt: new Date("2026-08-11T12:00:00.000Z"),
    updatedAt: new Date("2026-08-11T12:00:00.000Z"),
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<AssignmentSessionItemResult> = {},
): AssignmentSessionItemResult {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    organizationId: ids.organizationId,
    assignmentId: ids.assignmentId,
    sessionId: ids.sessionId,
    itemSnapshotId: ids.itemSnapshotId,
    completedAt: now,
    roundNumber: 1,
    reps: 5,
    load: "100lb",
    durationSeconds: null,
    distanceMeters: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup(overrides: Partial<AssignmentSessionTransaction> = {}) {
  const transaction: AssignmentSessionTransaction = {
    findRecipientAssignment: vi.fn(async () => ({
      assignmentId: ids.assignmentId,
      recipientId: ids.recipientId,
      sourceType: "workout" as const,
      status: "published" as const,
      timezone: "UTC",
      scheduledDate: "2026-08-11",
      startDate: null,
      endDate: null,
      availableFrom: new Date("2026-08-11T12:00:00.000Z"),
      availableUntil: new Date("2026-08-11T18:00:00.000Z"),
    })),
    findPrimaryWorkoutSnapshot: vi.fn(async () => ({
      workoutSnapshotId: ids.workoutSnapshotId,
    })),
    listPlanSlotSnapshots: vi.fn(async () => []),
    lockPlanSlotForAthlete: vi.fn(async () => undefined),
    listAthleteSessions: vi.fn(async () => []),
    findSessionForAthlete: vi.fn(async () => null),
    createSession: vi.fn(async () => makeSession()),
    findSessionByIdForAthlete: vi.fn(async () => makeSession()),
    listItemSnapshotIdsForWorkoutSnapshot: vi.fn(async () => [
      ids.itemSnapshotId,
    ]),
    replaceSessionResults: vi.fn(async () => undefined),
    touchSessionProgress: vi.fn(async () =>
      makeSession({
        version: 2,
        status: "in_progress",
        lastMutationId: ids.mutationId,
      }),
    ),
    submitSession: vi.fn(async () =>
      makeSession({ status: "submitted", submittedAt: now, version: 2 }),
    ),
    listSessionResults: vi.fn(async () => [makeResult()]),
    resetSession: vi.fn(async () =>
      makeSession({
        version: 1,
        status: "assigned",
        startedAt: null,
        submittedAt: null,
        lastMutationId: null,
      }),
    ),
    ...overrides,
  };

  const unitOfWork: AssignmentSessionUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };

  return { transaction, unitOfWork };
}

describe("assignment session service", () => {
  it("uses the scheduled local day when availability bounds are omitted", async () => {
    const { transaction, unitOfWork } = setup({
      findRecipientAssignment: vi.fn(async () => ({
        assignmentId: ids.assignmentId,
        recipientId: ids.recipientId,
        sourceType: "workout" as const,
        status: "published" as const,
        timezone: "America/New_York",
        scheduledDate: "2026-08-11",
        startDate: null,
        endDate: null,
        availableFrom: null,
        availableUntil: null,
      })),
    });

    await startAssignmentSession(unitOfWork, {
      organizationId: ids.organizationId,
      assignmentId: ids.assignmentId,
      athleteUserId: ids.athleteUserId,
      now,
    });

    expect(transaction.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledDate: "2026-08-11",
        availableFrom: new Date("2026-08-11T04:00:00.000Z"),
        availableUntil: new Date("2026-08-12T03:59:59.999Z"),
      }),
    );
  });

  it("preserves the full scheduled local day across daylight-saving changes", async () => {
    const { transaction, unitOfWork } = setup({
      findRecipientAssignment: vi.fn(async () => ({
        assignmentId: ids.assignmentId,
        recipientId: ids.recipientId,
        sourceType: "workout" as const,
        status: "published" as const,
        timezone: "America/New_York",
        scheduledDate: "2026-11-01",
        startDate: null,
        endDate: null,
        availableFrom: null,
        availableUntil: null,
      })),
    });

    await startAssignmentSession(unitOfWork, {
      organizationId: ids.organizationId,
      assignmentId: ids.assignmentId,
      athleteUserId: ids.athleteUserId,
      now: new Date("2026-11-01T15:00:00.000Z"),
    });

    expect(transaction.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        availableFrom: new Date("2026-11-01T04:00:00.000Z"),
        availableUntil: new Date("2026-11-02T04:59:59.999Z"),
      }),
    );
  });

  it("denies starting a session when athlete is not a recipient", async () => {
    const { unitOfWork } = setup({
      findRecipientAssignment: vi.fn(async () => null),
    });

    await expect(
      startAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        now,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("prevents canceled assignments from starting new sessions", async () => {
    const { transaction, unitOfWork } = setup({
      findRecipientAssignment: vi.fn(async () => ({
        assignmentId: ids.assignmentId,
        recipientId: ids.recipientId,
        sourceType: "workout" as const,
        status: "canceled" as const,
        timezone: "UTC",
        scheduledDate: "2026-08-11",
        startDate: null,
        endDate: null,
        availableFrom: null,
        availableUntil: null,
      })),
    });

    await expect(
      startAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        now,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(transaction.findPrimaryWorkoutSnapshot).not.toHaveBeenCalled();
    expect(transaction.createSession).not.toHaveBeenCalled();
  });

  it("keeps existing sessions accessible after assignment cancellation", async () => {
    const existingSession = makeSession({ status: "in_progress" });
    const { unitOfWork } = setup({
      findRecipientAssignment: vi.fn(async () => ({
        assignmentId: ids.assignmentId,
        recipientId: ids.recipientId,
        sourceType: "workout" as const,
        status: "canceled" as const,
        timezone: "UTC",
        scheduledDate: "2026-08-11",
        startDate: null,
        endDate: null,
        availableFrom: null,
        availableUntil: null,
      })),
      findSessionForAthlete: vi.fn(async () => existingSession),
      findSessionByIdForAthlete: vi.fn(async () => existingSession),
    });

    const session = await startAssignmentSession(unitOfWork, {
      organizationId: ids.organizationId,
      assignmentId: ids.assignmentId,
      athleteUserId: ids.athleteUserId,
      now,
    });

    expect(session.status).toBe("in_progress");
  });

  describe("plan occurrence sessions", () => {
    const planSlotId = "aaaaaaa1-0000-4000-8000-000000000001";
    const flexSlotId = "aaaaaaa2-0000-4000-8000-000000000002";

    function planSetup(overrides: Partial<AssignmentSessionTransaction> = {}) {
      return setup({
        findRecipientAssignment: vi.fn(async () => ({
          assignmentId: ids.assignmentId,
          recipientId: ids.recipientId,
          sourceType: "plan" as const,
          status: "published" as const,
          timezone: "UTC",
          scheduledDate: null,
          startDate: "2026-08-10",
          endDate: "2026-08-30",
          availableFrom: null,
          availableUntil: null,
        })),
        listPlanSlotSnapshots: vi.fn(async () => [
          {
            id: planSlotId,
            workoutSnapshotId: ids.workoutSnapshotId,
            scheduleType: "fixed_day" as const,
            dayOfWeek: "monday" as const,
            targetSessionsPerWeek: null,
          },
          {
            id: flexSlotId,
            workoutSnapshotId: "66666666-6666-4666-8666-666666666667",
            scheduleType: "weekly_frequency" as const,
            dayOfWeek: null,
            targetSessionsPerWeek: 2,
          },
        ]),
        ...overrides,
      });
    }

    it("requires an explicit plan workout selection", async () => {
      const { unitOfWork } = planSetup();

      await expect(
        startAssignmentSession(unitOfWork, {
          organizationId: ids.organizationId,
          assignmentId: ids.assignmentId,
          athleteUserId: ids.athleteUserId,
          now,
        }),
      ).rejects.toBeInstanceOf(DomainInvariantError);
    });

    it("starts a fixed-day occurrence on its scheduled weekday", async () => {
      const { transaction, unitOfWork } = planSetup();

      await startAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        planSlotSnapshotId: planSlotId,
        scheduledDate: "2026-08-10",
        now,
      });

      expect(transaction.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          workoutSnapshotId: ids.workoutSnapshotId,
          planSlotSnapshotId: planSlotId,
          scheduledDate: "2026-08-10",
        }),
      );
    });

    it("rejects a fixed-day occurrence on the wrong weekday", async () => {
      const { transaction, unitOfWork } = planSetup();

      await expect(
        startAssignmentSession(unitOfWork, {
          organizationId: ids.organizationId,
          assignmentId: ids.assignmentId,
          athleteUserId: ids.athleteUserId,
          planSlotSnapshotId: planSlotId,
          scheduledDate: "2026-08-11",
          now,
        }),
      ).rejects.toBeInstanceOf(DomainInvariantError);

      expect(transaction.createSession).not.toHaveBeenCalled();
    });

    it("rejects dates outside the assignment range", async () => {
      const { unitOfWork } = planSetup();

      await expect(
        startAssignmentSession(unitOfWork, {
          organizationId: ids.organizationId,
          assignmentId: ids.assignmentId,
          athleteUserId: ids.athleteUserId,
          planSlotSnapshotId: planSlotId,
          scheduledDate: "2026-09-07",
          now,
        }),
      ).rejects.toBeInstanceOf(DomainInvariantError);
    });

    it("returns the existing session for the same occurrence", async () => {
      const existing = makeSession({ status: "in_progress" });
      const { transaction, unitOfWork } = planSetup({
        listAthleteSessions: vi.fn(async () => [
          {
            id: existing.id,
            planSlotSnapshotId: planSlotId,
            workoutSnapshotId: ids.workoutSnapshotId,
            scheduledDate: "2026-08-10",
            status: "in_progress" as const,
          },
        ]),
        findSessionByIdForAthlete: vi.fn(async () => existing),
      });

      const session = await startAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        planSlotSnapshotId: planSlotId,
        scheduledDate: "2026-08-10",
        now,
      });

      expect(session.id).toBe(existing.id);
      expect(transaction.createSession).not.toHaveBeenCalled();
    });

    it("starts flexible occurrences on athlete-chosen current-week days", async () => {
      const { transaction, unitOfWork } = planSetup();

      await startAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        planSlotSnapshotId: flexSlotId,
        now,
      });

      expect(transaction.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          planSlotSnapshotId: flexSlotId,
          scheduledDate: "2026-08-11",
        }),
      );
    });

    it("rejects flexible starts beyond the weekly target", async () => {
      const { transaction, unitOfWork } = planSetup({
        listAthleteSessions: vi.fn(async () => [
          {
            id: "s1",
            planSlotSnapshotId: flexSlotId,
            workoutSnapshotId: "66666666-6666-4666-8666-666666666667",
            scheduledDate: "2026-08-10",
            status: "submitted" as const,
          },
          {
            id: "s2",
            planSlotSnapshotId: flexSlotId,
            workoutSnapshotId: "66666666-6666-4666-8666-666666666667",
            scheduledDate: "2026-08-11",
            status: "in_progress" as const,
          },
        ]),
      });

      await expect(
        startAssignmentSession(unitOfWork, {
          organizationId: ids.organizationId,
          assignmentId: ids.assignmentId,
          athleteUserId: ids.athleteUserId,
          planSlotSnapshotId: flexSlotId,
          scheduledDate: "2026-08-12",
          now: new Date("2026-08-12T15:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(DomainInvariantError);

      expect(transaction.createSession).not.toHaveBeenCalled();
    });

    it("allows a new flexible occurrence after the week rolls over", async () => {
      const { transaction, unitOfWork } = planSetup({
        listAthleteSessions: vi.fn(async () => [
          {
            id: "s1",
            planSlotSnapshotId: flexSlotId,
            workoutSnapshotId: "66666666-6666-4666-8666-666666666667",
            scheduledDate: "2026-08-10",
            status: "submitted" as const,
          },
          {
            id: "s2",
            planSlotSnapshotId: flexSlotId,
            workoutSnapshotId: "66666666-6666-4666-8666-666666666667",
            scheduledDate: "2026-08-13",
            status: "submitted" as const,
          },
        ]),
      });

      await startAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        planSlotSnapshotId: flexSlotId,
        now: new Date("2026-08-18T15:00:00.000Z"),
      });

      expect(transaction.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          planSlotSnapshotId: flexSlotId,
          scheduledDate: "2026-08-18",
        }),
      );
    });

    it("locks the plan slot before counting weekly sessions", async () => {
      const callOrder: string[] = [];
      const { transaction, unitOfWork } = planSetup({
        lockPlanSlotForAthlete: vi.fn(async () => {
          callOrder.push("lock");
        }),
        listAthleteSessions: vi.fn(async () => {
          callOrder.push("count");
          return [];
        }),
      });

      await startAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        planSlotSnapshotId: flexSlotId,
        now,
      });

      expect(transaction.lockPlanSlotForAthlete).toHaveBeenCalledWith({
        planSlotSnapshotId: flexSlotId,
        athleteUserId: ids.athleteUserId,
      });
      expect(callOrder.at(-2)).toBe("lock");
      expect(callOrder.at(-1)).toBe("count");
    });

    it("rejects unknown plan slot snapshot ids", async () => {
      const { unitOfWork } = planSetup();

      await expect(
        startAssignmentSession(unitOfWork, {
          organizationId: ids.organizationId,
          assignmentId: ids.assignmentId,
          athleteUserId: ids.athleteUserId,
          planSlotSnapshotId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          now,
        }),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
  });

  it("treats duplicate mutation autosave as idempotent", async () => {
    const existing = makeSession({
      status: "in_progress",
      version: 2,
      lastMutationId: ids.mutationId,
    });
    const { transaction, unitOfWork } = setup({
      findSessionByIdForAthlete: vi.fn(async () => existing),
    });

    const updated = await autosaveAssignmentSessionResults(unitOfWork, {
      organizationId: ids.organizationId,
      assignmentId: ids.assignmentId,
      athleteUserId: ids.athleteUserId,
      sessionId: ids.sessionId,
      expectedVersion: 2,
      mutationId: ids.mutationId,
      results: [
        {
          itemSnapshotId: ids.itemSnapshotId,
          completedAt: now,
          roundNumber: 1,
          reps: 8,
          load: null,
          durationSeconds: null,
          distanceMeters: null,
          notes: null,
        },
      ],
    });

    expect(updated.id).toBe(ids.sessionId);
    expect(transaction.replaceSessionResults).not.toHaveBeenCalled();
    expect(transaction.touchSessionProgress).not.toHaveBeenCalled();
  });

  it("rejects autosave with stale expected version", async () => {
    const { transaction, unitOfWork } = setup({
      findSessionByIdForAthlete: vi.fn(async () => makeSession({ version: 2 })),
    });

    await expect(
      autosaveAssignmentSessionResults(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        sessionId: ids.sessionId,
        expectedVersion: 1,
        mutationId: ids.mutationId,
        results: [],
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(transaction.replaceSessionResults).not.toHaveBeenCalled();
    expect(transaction.touchSessionProgress).not.toHaveBeenCalled();
  });

  it("rejects autosave outside availability window", async () => {
    const { unitOfWork } = setup({
      findSessionByIdForAthlete: vi.fn(async () =>
        makeSession({
          availableFrom: new Date("2026-08-11T00:00:00.000Z"),
          availableUntil: new Date("2026-08-11T00:01:00.000Z"),
          version: 1,
        }),
      ),
    });

    await expect(
      autosaveAssignmentSessionResults(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        sessionId: ids.sessionId,
        expectedVersion: 1,
        mutationId: ids.mutationId,
        results: [],
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);
  });

  it("rejects submit when session is outside availability window", async () => {
    const { unitOfWork } = setup({
      findSessionByIdForAthlete: vi.fn(async () =>
        makeSession({
          status: "in_progress",
          availableFrom: new Date("2026-08-11T00:00:00.000Z"),
          availableUntil: new Date("2026-08-11T00:01:00.000Z"),
          version: 1,
        }),
      ),
    });

    await expect(
      submitAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        sessionId: ids.sessionId,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);
  });

  it("rejects submit for non-owner athlete session access", async () => {
    const { unitOfWork } = setup({
      findSessionByIdForAthlete: vi.fn(async () => null),
    });

    await expect(
      submitAssignmentSession(unitOfWork, {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        sessionId: ids.sessionId,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("resets an in-progress session and clears persisted results", async () => {
    const resetSessionMock = vi.fn(async () =>
      makeSession({
        version: 1,
        status: "assigned",
        startedAt: null,
        submittedAt: null,
        lastMutationId: null,
      }),
    );
    const { transaction, unitOfWork } = setup({
      findSessionByIdForAthlete: vi.fn(async () =>
        makeSession({
          status: "in_progress",
          version: 3,
          lastMutationId: ids.mutationId,
        }),
      ),
      resetSession: resetSessionMock,
    });

    const reset = await resetAssignmentSession(unitOfWork, {
      organizationId: ids.organizationId,
      assignmentId: ids.assignmentId,
      athleteUserId: ids.athleteUserId,
      sessionId: ids.sessionId,
      expectedVersion: 3,
      now: new Date("2026-08-11T15:10:00.000Z"),
    });

    expect(reset.status).toBe("assigned");
    expect(resetSessionMock).toHaveBeenCalledWith({
      organizationId: ids.organizationId,
      assignmentId: ids.assignmentId,
      sessionId: ids.sessionId,
      expectedVersion: 3,
    });
    expect(transaction.listSessionResults).not.toHaveBeenCalled();
  });
});
