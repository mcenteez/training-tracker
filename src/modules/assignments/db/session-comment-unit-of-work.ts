import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  SessionCommentTransaction,
  SessionCommentUnitOfWork,
} from "@/modules/assignments/application/session-comment-service";
import {
  assignmentRecipientTeamScopes,
  assignmentSessionComments,
  assignmentSessions,
} from "@/modules/assignments/db/schema";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { teamMemberships } from "@/modules/teams/db/schema";

export function createSessionCommentUnitOfWork(
  database: Database,
): SessionCommentUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: SessionCommentTransaction = {
          async findOrganizationRole(organizationId, userId) {
            const [membership] = await databaseTransaction
              .select({ role: organizationMemberships.role })
              .from(organizationMemberships)
              .where(
                and(
                  eq(organizationMemberships.organizationId, organizationId),
                  eq(organizationMemberships.userId, userId),
                ),
              )
              .limit(1);
            return membership?.role ?? null;
          },
          async findTeamRole(organizationId, teamId, userId) {
            const [membership] = await databaseTransaction
              .select({ role: teamMemberships.role })
              .from(teamMemberships)
              .where(
                and(
                  eq(teamMemberships.organizationId, organizationId),
                  eq(teamMemberships.teamId, teamId),
                  eq(teamMemberships.userId, userId),
                ),
              )
              .limit(1);
            return membership?.role ?? null;
          },
          async submittedSessionExists(input) {
            const [session] = await databaseTransaction
              .select({ id: assignmentSessions.id })
              .from(assignmentSessions)
              .innerJoin(
                assignmentRecipientTeamScopes,
                and(
                  eq(
                    assignmentRecipientTeamScopes.organizationId,
                    assignmentSessions.organizationId,
                  ),
                  eq(
                    assignmentRecipientTeamScopes.assignmentId,
                    assignmentSessions.assignmentId,
                  ),
                  eq(
                    assignmentRecipientTeamScopes.recipientId,
                    assignmentSessions.recipientId,
                  ),
                ),
              )
              .where(
                and(
                  eq(assignmentSessions.organizationId, input.organizationId),
                  eq(assignmentSessions.assignmentId, input.assignmentId),
                  eq(assignmentSessions.id, input.sessionId),
                  eq(assignmentSessions.status, "submitted"),
                  eq(assignmentRecipientTeamScopes.teamId, input.teamId),
                ),
              )
              .limit(1)
              .for("update", { of: assignmentSessions });
            return session !== undefined;
          },
          async insertComment(input) {
            const [comment] = await databaseTransaction
              .insert(assignmentSessionComments)
              .values(input)
              .returning({
                id: assignmentSessionComments.id,
                body: assignmentSessionComments.body,
                createdAt: assignmentSessionComments.createdAt,
              });
            if (!comment) throw new Error("Failed to insert session comment");
            return comment;
          },
        };

        return operation(transaction);
      }),
  };
}
