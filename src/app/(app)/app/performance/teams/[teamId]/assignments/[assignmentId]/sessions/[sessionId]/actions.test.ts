import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendSessionCommentMock,
  createSessionCommentUnitOfWorkMock,
  loadActiveAppContextMock,
  revalidatePathMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  appendSessionCommentMock: vi.fn(),
  createSessionCommentUnitOfWorkMock: vi.fn(),
  loadActiveAppContextMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  withDatabaseMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));
vi.mock("@/modules/assignments/application/session-comment-service", () => ({
  appendSessionComment: appendSessionCommentMock,
}));
vi.mock("@/modules/assignments/db/session-comment-unit-of-work", () => ({
  createSessionCommentUnitOfWork: createSessionCommentUnitOfWorkMock,
}));

import { AuthorizationError } from "@/modules/access-control/errors";
import { appendStaffSessionCommentAction } from "./actions";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  teamId: "22222222-2222-4222-8222-222222222222",
  assignmentId: "33333333-3333-4333-8333-333333333333",
  sessionId: "44444444-4444-4444-8444-444444444444",
  userId: "55555555-5555-4555-8555-555555555555",
};

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("teamId", ids.teamId);
  formData.set("assignmentId", ids.assignmentId);
  formData.set("sessionId", ids.sessionId);
  formData.set("body", " Keep the bar path vertical. ");
  return formData;
}

describe("appendStaffSessionCommentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: ids.userId },
      membership: { organizationId: ids.organizationId },
    });
    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({ id: "database" }),
    );
    createSessionCommentUnitOfWorkMock.mockReturnValue({ id: "unit-of-work" });
    appendSessionCommentMock.mockResolvedValue({ id: "comment-1" });
  });

  it("appends and revalidates an authorized comment", async () => {
    await expect(
      appendStaffSessionCommentAction({}, validFormData()),
    ).resolves.toEqual({ message: "Comment added.", success: true });

    expect(appendSessionCommentMock).toHaveBeenCalledWith(
      { id: "unit-of-work" },
      {
        organizationId: ids.organizationId,
        teamId: ids.teamId,
        assignmentId: ids.assignmentId,
        sessionId: ids.sessionId,
        actorUserId: ids.userId,
        body: "Keep the bar path vertical.",
      },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/app/performance/teams/${ids.teamId}/assignments/${ids.assignmentId}/sessions/${ids.sessionId}`,
    );
  });

  it("rejects malformed input before loading actor context", async () => {
    const formData = validFormData();
    formData.set("body", "   ");

    await expect(
      appendStaffSessionCommentAction({}, formData),
    ).resolves.toMatchObject({ errors: { body: expect.any(Array) } });
    expect(loadActiveAppContextMock).not.toHaveBeenCalled();
    expect(appendSessionCommentMock).not.toHaveBeenCalled();
  });

  it("returns generic feedback when current permissions reject the mutation", async () => {
    appendSessionCommentMock.mockRejectedValue(new AuthorizationError());

    await expect(
      appendStaffSessionCommentAction({}, validFormData()),
    ).resolves.toEqual({ message: "Comment could not be added." });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
