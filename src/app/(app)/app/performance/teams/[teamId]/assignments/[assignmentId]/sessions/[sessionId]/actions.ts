"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import { commentAssignmentSessionInputSchema } from "@/modules/assignments/application/assignment-input";
import { appendSessionComment } from "@/modules/assignments/application/session-comment-service";
import { createSessionCommentUnitOfWork } from "@/modules/assignments/db/session-comment-unit-of-work";

const staffSessionCommentInputSchema =
  commentAssignmentSessionInputSchema.extend({
    teamId: z.uuid(),
    assignmentId: z.uuid(),
  });

export interface StaffSessionCommentActionState {
  message?: string;
  success?: boolean;
  errors?: { body?: string[] };
}

export async function appendStaffSessionCommentAction(
  _previousState: StaffSessionCommentActionState,
  formData: FormData,
): Promise<StaffSessionCommentActionState> {
  const parsedInput = staffSessionCommentInputSchema.safeParse({
    teamId: formData.get("teamId"),
    assignmentId: formData.get("assignmentId"),
    sessionId: formData.get("sessionId"),
    body: formData.get("body"),
  });

  if (!parsedInput.success) {
    const fieldErrors = z.flattenError(parsedInput.error).fieldErrors;
    return {
      message: "Enter a comment between 1 and 2,000 characters.",
      errors: { body: fieldErrors.body },
    };
  }

  const context = await loadActiveAppContext();
  const { teamId, assignmentId, sessionId, body } = parsedInput.data;

  try {
    await withDatabase((database) =>
      appendSessionComment(createSessionCommentUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        teamId,
        assignmentId,
        sessionId,
        actorUserId: context.user.id,
        body,
      }),
    );
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      return { message: "Comment could not be added." };
    }
    throw error;
  }

  revalidatePath(
    `/app/performance/teams/${teamId}/assignments/${assignmentId}/sessions/${sessionId}`,
  );
  return { message: "Comment added.", success: true };
}
