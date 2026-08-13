import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainInvariantError } from "@/modules/access-control/errors";

const {
  loadActiveAppContextMock,
  withDatabaseMock,
  startAssignmentSessionMock,
  autosaveAssignmentSessionResultsMock,
  submitAssignmentSessionMock,
  resetAssignmentSessionMock,
  createAssignmentSessionUnitOfWorkMock,
  redirectMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  loadActiveAppContextMock: vi.fn(),
  withDatabaseMock: vi.fn(),
  startAssignmentSessionMock: vi.fn(),
  autosaveAssignmentSessionResultsMock: vi.fn(),
  submitAssignmentSessionMock: vi.fn(),
  resetAssignmentSessionMock: vi.fn(),
  createAssignmentSessionUnitOfWorkMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));
vi.mock("@/modules/assignments/db/session-unit-of-work", () => ({
  createAssignmentSessionUnitOfWork: createAssignmentSessionUnitOfWorkMock,
}));
vi.mock("@/modules/assignments/application/assignment-session-service", () => ({
  startAssignmentSession: startAssignmentSessionMock,
  autosaveAssignmentSessionResults: autosaveAssignmentSessionResultsMock,
  submitAssignmentSession: submitAssignmentSessionMock,
  resetAssignmentSession: resetAssignmentSessionMock,
}));

import {
  autosaveWorkoutOccurrenceAction,
  resetWorkoutOccurrenceAction,
  startWorkoutOccurrenceAction,
  submitWorkoutOccurrenceAction,
} from "./actions";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  athleteUserId: "22222222-2222-4222-8222-222222222222",
  assignmentId: "33333333-3333-4333-8333-333333333333",
  sessionId: "44444444-4444-4444-8444-444444444444",
  itemSnapshotId: "55555555-5555-4555-8555-555555555555",
  workoutSnapshotId: "66666666-6666-4666-8666-666666666666",
  planSlotSnapshotId: "77777777-7777-4777-8777-777777777777",
};

const occurrenceUrl = `/app/athlete/assignments/${ids.assignmentId}/workouts/${ids.workoutSnapshotId}/2026-08-11`;

function occurrenceFormData(): FormData {
  const formData = new FormData();
  formData.set("assignmentId", ids.assignmentId);
  formData.set("workoutSnapshotId", ids.workoutSnapshotId);
  formData.set("scheduledDate", "2026-08-11");
  return formData;
}

describe("workout occurrence actions", () => {
  beforeEach(() => {
    loadActiveAppContextMock.mockReset();
    withDatabaseMock.mockReset();
    startAssignmentSessionMock.mockReset();
    autosaveAssignmentSessionResultsMock.mockReset();
    submitAssignmentSessionMock.mockReset();
    resetAssignmentSessionMock.mockReset();
    createAssignmentSessionUnitOfWorkMock.mockReset();
    redirectMock.mockReset();
    revalidatePathMock.mockReset();

    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });

    loadActiveAppContextMock.mockResolvedValue({
      user: { id: ids.athleteUserId },
      membership: {
        organizationId: ids.organizationId,
        organizationRole: "athlete",
      },
      memberships: [],
    });

    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({ id: "db" }),
    );

    createAssignmentSessionUnitOfWorkMock.mockReturnValue({
      unitOfWork: "session-uow",
    });

    startAssignmentSessionMock.mockResolvedValue(undefined);
    autosaveAssignmentSessionResultsMock.mockResolvedValue(undefined);
    submitAssignmentSessionMock.mockResolvedValue(undefined);
    resetAssignmentSessionMock.mockResolvedValue(undefined);
  });

  it("starts a plan occurrence and redirects with success", async () => {
    const formData = occurrenceFormData();
    formData.set("planSlotSnapshotId", ids.planSlotSnapshotId);

    await expect(startWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?started=1`,
    );

    expect(startAssignmentSessionMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        planSlotSnapshotId: ids.planSlotSnapshotId,
        scheduledDate: "2026-08-11",
      },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/app/athlete/assignments/${ids.assignmentId}`,
    );
  });

  it("starts a workout-only occurrence without a plan slot", async () => {
    const formData = occurrenceFormData();

    await expect(startWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?started=1`,
    );

    expect(startAssignmentSessionMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      expect.objectContaining({
        planSlotSnapshotId: null,
        scheduledDate: null,
      }),
    );
  });

  it("rejects malformed occurrence references", async () => {
    const formData = occurrenceFormData();
    formData.set("scheduledDate", "not-a-date");

    await expect(startWorkoutOccurrenceAction(formData)).rejects.toThrow(
      "REDIRECT:/app/athlete?error=invalid_assignment",
    );

    expect(startAssignmentSessionMock).not.toHaveBeenCalled();
  });

  it("autosaves parsed item results and redirects with success", async () => {
    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    const formData = occurrenceFormData();
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "1");
    formData.set("durationMinutes", "45");
    formData.set("sessionRpe", "8");
    formData.append("itemSnapshotIds", ids.itemSnapshotId);
    formData.set(`result:${ids.itemSnapshotId}:reps`, "12");
    formData.set(`result:${ids.itemSnapshotId}:loadValue`, "135");
    formData.set(`result:${ids.itemSnapshotId}:loadUnit`, "lb");
    formData.set(`result:${ids.itemSnapshotId}:notes`, "good tempo");

    await expect(autosaveWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?saved=1`,
    );

    expect(autosaveAssignmentSessionResultsMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      expect.objectContaining({
        sessionId: ids.sessionId,
        expectedVersion: 1,
        mutationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        durationMinutes: 45,
        sessionRpe: 8,
        results: [
          expect.objectContaining({
            itemSnapshotId: ids.itemSnapshotId,
            reps: 12,
            loadValue: 135,
            loadUnit: "lb",
            notes: "good tempo",
          }),
        ],
      }),
    );

    randomUuidSpy.mockRestore();
  });

  it("preserves omitted session response as null", async () => {
    const formData = occurrenceFormData();
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "1");
    formData.set("durationMinutes", "");
    formData.set("sessionRpe", "");

    await expect(autosaveWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?saved=1`,
    );

    expect(autosaveAssignmentSessionResultsMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      expect.objectContaining({
        durationMinutes: null,
        sessionRpe: null,
      }),
    );
  });

  it("returns actionable feedback for malformed session capture", async () => {
    const formData = occurrenceFormData();
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "1");
    formData.set("sessionRpe", "hard");

    await expect(autosaveWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?error=invalid_session_load`,
    );
    expect(autosaveAssignmentSessionResultsMock).not.toHaveBeenCalled();
  });

  it.each([
    { loadValue: "100", loadUnit: "stone" },
    { loadValue: "Infinity", loadUnit: "kg" },
  ])("rejects invalid structured load input %#", async (load) => {
    const formData = occurrenceFormData();
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "1");
    formData.append("itemSnapshotIds", ids.itemSnapshotId);
    formData.set(`result:${ids.itemSnapshotId}:loadValue`, load.loadValue);
    formData.set(`result:${ids.itemSnapshotId}:loadUnit`, load.loadUnit);

    await expect(autosaveWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?error=invalid_session_load`,
    );
    expect(autosaveAssignmentSessionResultsMock).not.toHaveBeenCalled();
  });

  it("maps expected domain errors to the occurrence error redirect", async () => {
    autosaveAssignmentSessionResultsMock.mockRejectedValue(
      new DomainInvariantError("out of window"),
    );

    const formData = occurrenceFormData();
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "1");

    await expect(autosaveWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?error=assignment_session_action_failed`,
    );
  });

  it("persists pending results before submitting", async () => {
    autosaveAssignmentSessionResultsMock.mockResolvedValue({ version: 3 });

    const formData = occurrenceFormData();
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "2");
    formData.append("itemSnapshotIds", ids.itemSnapshotId);
    formData.set(`result:${ids.itemSnapshotId}:complete`, "1");

    await expect(submitWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?submitted=1`,
    );

    expect(submitAssignmentSessionMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      expect.objectContaining({ expectedVersion: 3 }),
    );
  });

  it("resets an occurrence and redirects with success", async () => {
    const formData = occurrenceFormData();
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "3");

    await expect(resetWorkoutOccurrenceAction(formData)).rejects.toThrow(
      `REDIRECT:${occurrenceUrl}?reset=1`,
    );

    expect(resetAssignmentSessionMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      expect.objectContaining({
        sessionId: ids.sessionId,
        expectedVersion: 3,
      }),
    );
  });
});
