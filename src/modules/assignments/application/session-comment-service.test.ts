import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";

import {
  appendSessionComment,
  type SessionCommentTransaction,
  type SessionCommentUnitOfWork,
} from "./session-comment-service";

function setup(options?: {
  organizationRole?: OrganizationRole | null;
  teamRole?: TeamRole | null;
  submittedSessionExists?: boolean;
}) {
  const transaction: SessionCommentTransaction = {
    findOrganizationRole: vi.fn(
      async () => options?.organizationRole ?? "athlete",
    ),
    findTeamRole: vi.fn(async () => options?.teamRole ?? "manager"),
    submittedSessionExists: vi.fn(
      async () => options?.submittedSessionExists ?? true,
    ),
    insertComment: vi.fn(async (input) => ({
      id: "comment-1",
      body: input.body,
      createdAt: new Date("2026-08-12T12:00:00.000Z"),
    })),
    recordAuditEvent: vi.fn(async () => undefined),
  };
  const unitOfWork: SessionCommentUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };
  return { transaction, unitOfWork };
}

const input = {
  organizationId: "organization-1",
  teamId: "team-1",
  assignmentId: "assignment-1",
  sessionId: "session-1",
  actorUserId: "manager-1",
  body: "  Keep the tempo consistent.  ",
};

describe("appendSessionComment", () => {
  it("appends a normalized comment for a Team Manager", async () => {
    const context = setup();

    await expect(
      appendSessionComment(context.unitOfWork, input),
    ).resolves.toMatchObject({ body: "Keep the tempo consistent." });
    expect(context.transaction.insertComment).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: input.sessionId,
      actorUserId: input.actorUserId,
      body: "Keep the tempo consistent.",
    });
    expect(context.transaction.recordAuditEvent).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "assignment.session.comment.created",
      details: {
        teamId: input.teamId,
        assignmentId: input.assignmentId,
        sessionId: input.sessionId,
        commentId: "comment-1",
      },
    });
    expect(context.transaction.recordAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.anything() }),
    );
  });

  it("allows an Organization Manager without a Team role", async () => {
    const context = setup({ organizationRole: "manager", teamRole: null });
    await expect(
      appendSessionComment(context.unitOfWork, input),
    ).resolves.toMatchObject({ id: "comment-1" });
  });

  it("rejects Team Viewers and Athletes independently of route visibility", async () => {
    for (const teamRole of ["viewer", "athlete"] as const) {
      const context = setup({ teamRole });
      await expect(
        appendSessionComment(context.unitOfWork, input),
      ).rejects.toBeInstanceOf(AuthorizationError);
      expect(context.transaction.insertComment).not.toHaveBeenCalled();
    }
  });

  it("rejects non-submitted or foreign sessions", async () => {
    const context = setup({ submittedSessionExists: false });
    await expect(
      appendSessionComment(context.unitOfWork, input),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(context.transaction.insertComment).not.toHaveBeenCalled();
  });

  it("rejects malformed comment bodies", async () => {
    const context = setup();
    await expect(
      appendSessionComment(context.unitOfWork, { ...input, body: "   " }),
    ).rejects.toBeInstanceOf(DomainInvariantError);
    expect(context.unitOfWork.transaction).not.toHaveBeenCalled();
  });
});
