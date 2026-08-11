import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainInvariantError } from "@/modules/access-control/errors";

const {
  loadActiveAppContextMock,
  withDatabaseMock,
  startAssignmentSessionMock,
  autosaveAssignmentSessionResultsMock,
  submitAssignmentSessionMock,
  createAssignmentSessionUnitOfWorkMock,
  redirectMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  loadActiveAppContextMock: vi.fn(),
  withDatabaseMock: vi.fn(),
  startAssignmentSessionMock: vi.fn(),
  autosaveAssignmentSessionResultsMock: vi.fn(),
  submitAssignmentSessionMock: vi.fn(),
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
}));

import {
  autosaveAssignmentSessionAction,
  startAssignmentSessionAction,
  submitAssignmentSessionAction,
} from "./actions";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  athleteUserId: "22222222-2222-4222-8222-222222222222",
  assignmentId: "33333333-3333-4333-8333-333333333333",
  sessionId: "44444444-4444-4444-8444-444444444444",
  itemSnapshotId: "55555555-5555-4555-8555-555555555555",
};

describe("athlete assignment actions", () => {
  beforeEach(() => {
    loadActiveAppContextMock.mockReset();
    withDatabaseMock.mockReset();
    startAssignmentSessionMock.mockReset();
    autosaveAssignmentSessionResultsMock.mockReset();
    submitAssignmentSessionMock.mockReset();
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
  });

  it("starts a session and redirects with success", async () => {
    const formData = new FormData();
    formData.set("assignmentId", ids.assignmentId);

    await expect(startAssignmentSessionAction(formData)).rejects.toThrow(
      `REDIRECT:/app/athlete/assignments/${ids.assignmentId}?started=1`,
    );

    expect(startAssignmentSessionMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
      },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/app/athlete/assignments/${ids.assignmentId}`,
    );
  });

  it("rejects missing assignment id for start action", async () => {
    await expect(startAssignmentSessionAction(new FormData())).rejects.toThrow(
      "REDIRECT:/app/athlete?error=invalid_assignment",
    );

    expect(startAssignmentSessionMock).not.toHaveBeenCalled();
  });

  it("autosaves parsed item results and redirects with success", async () => {
    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    const formData = new FormData();
    formData.set("assignmentId", ids.assignmentId);
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "1");
    formData.append("itemSnapshotIds", ids.itemSnapshotId);
    formData.set(`result:${ids.itemSnapshotId}:reps`, "12");
    formData.set(`result:${ids.itemSnapshotId}:load`, "95lb");
    formData.set(`result:${ids.itemSnapshotId}:notes`, "good tempo");

    await expect(autosaveAssignmentSessionAction(formData)).rejects.toThrow(
      `REDIRECT:/app/athlete/assignments/${ids.assignmentId}?saved=1`,
    );

    expect(autosaveAssignmentSessionResultsMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      expect.objectContaining({
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        sessionId: ids.sessionId,
        expectedVersion: 1,
        mutationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        results: [
          {
            itemSnapshotId: ids.itemSnapshotId,
            completedAt: expect.any(Date),
            roundNumber: 1,
            reps: 12,
            load: "95lb",
            durationSeconds: null,
            distanceMeters: null,
            notes: "good tempo",
          },
        ],
      }),
    );

    randomUuidSpy.mockRestore();
  });

  it("saves a completion-only result when the exercise is marked complete", async () => {
    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

    const formData = new FormData();
    formData.set("assignmentId", ids.assignmentId);
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "1");
    formData.append("itemSnapshotIds", ids.itemSnapshotId);
    formData.set(`result:${ids.itemSnapshotId}:complete`, "1");

    await expect(autosaveAssignmentSessionAction(formData)).rejects.toThrow(
      `REDIRECT:/app/athlete/assignments/${ids.assignmentId}?saved=1`,
    );

    expect(autosaveAssignmentSessionResultsMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      expect.objectContaining({
        mutationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        results: [
          expect.objectContaining({
            itemSnapshotId: ids.itemSnapshotId,
            completedAt: expect.any(Date),
            roundNumber: 1,
            reps: null,
            load: null,
            durationSeconds: null,
            distanceMeters: null,
            notes: null,
          }),
        ],
      }),
    );

    randomUuidSpy.mockRestore();
  });

  it("maps expected domain errors to assignment action failure redirect", async () => {
    autosaveAssignmentSessionResultsMock.mockRejectedValue(
      new DomainInvariantError("out of window"),
    );

    const formData = new FormData();
    formData.set("assignmentId", ids.assignmentId);
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "1");

    await expect(autosaveAssignmentSessionAction(formData)).rejects.toThrow(
      `REDIRECT:/app/athlete/assignments/${ids.assignmentId}?error=assignment_session_action_failed`,
    );
  });

  it("submits a session and redirects with success", async () => {
    const formData = new FormData();
    formData.set("assignmentId", ids.assignmentId);
    formData.set("sessionId", ids.sessionId);
    formData.set("expectedVersion", "2");

    await expect(submitAssignmentSessionAction(formData)).rejects.toThrow(
      `REDIRECT:/app/athlete/assignments/${ids.assignmentId}?submitted=1`,
    );

    expect(submitAssignmentSessionMock).toHaveBeenCalledWith(
      { unitOfWork: "session-uow" },
      {
        organizationId: ids.organizationId,
        assignmentId: ids.assignmentId,
        athleteUserId: ids.athleteUserId,
        sessionId: ids.sessionId,
        expectedVersion: 2,
      },
    );
  });
});
