import {
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  requireOrganizationRoleAtLeast,
  requireTeamAccess,
} from "@/modules/access-control/guards";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";

export interface SessionCommentRecord {
  id: string;
  body: string;
  createdAt: Date;
}

export interface SessionCommentTransaction {
  findOrganizationRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  findTeamRole(
    organizationId: string,
    teamId: string,
    userId: string,
  ): Promise<TeamRole | null>;
  submittedSessionExists(input: {
    organizationId: string;
    teamId: string;
    assignmentId: string;
    sessionId: string;
  }): Promise<boolean>;
  insertComment(input: {
    organizationId: string;
    assignmentId: string;
    sessionId: string;
    actorUserId: string;
    body: string;
  }): Promise<SessionCommentRecord>;
}

export interface SessionCommentUnitOfWork {
  transaction<Result>(
    operation: (transaction: SessionCommentTransaction) => Promise<Result>,
  ): Promise<Result>;
}

export async function appendSessionComment(
  unitOfWork: SessionCommentUnitOfWork,
  input: {
    organizationId: string;
    teamId: string;
    assignmentId: string;
    sessionId: string;
    actorUserId: string;
    body: string;
  },
): Promise<SessionCommentRecord> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > 2000) {
    throw new DomainInvariantError(
      "Comment body must contain 1 to 2000 characters",
    );
  }

  return unitOfWork.transaction(async (transaction) => {
    const organizationRole = requireOrganizationRoleAtLeast(
      await transaction.findOrganizationRole(
        input.organizationId,
        input.actorUserId,
      ),
      "athlete",
    );
    const teamRole = await transaction.findTeamRole(
      input.organizationId,
      input.teamId,
      input.actorUserId,
    );
    requireTeamAccess({ organizationRole, teamRole }, "results.comment");

    const submittedSessionExists = await transaction.submittedSessionExists({
      organizationId: input.organizationId,
      teamId: input.teamId,
      assignmentId: input.assignmentId,
      sessionId: input.sessionId,
    });
    if (!submittedSessionExists) {
      throw new ResourceNotFoundError("Submitted team session");
    }

    return transaction.insertComment({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      sessionId: input.sessionId,
      actorUserId: input.actorUserId,
      body,
    });
  });
}
