"use server";

import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { loadAuthenticatedUser } from "@/lib/app-context";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import { acceptTeamInvitation } from "@/modules/teams/application/team-invitation-service";
import { createTeamInvitationUnitOfWork } from "@/modules/teams/db/team-invitation-unit-of-work";

export async function acceptTeamInvitationAction(token: string): Promise<void> {
  const invitationPath = `/accept-team-invite/${token}`;
  const user = await loadAuthenticatedUser({
    signInRedirect: `/sign-in?redirect_url=${invitationPath}`,
  });

  try {
    await withDatabase((database) =>
      acceptTeamInvitation(createTeamInvitationUnitOfWork(database), {
        actorUserId: user.id,
        actorEmail: user.email,
        token,
      }),
    );
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect(`${invitationPath}?error=invite_unavailable`);
    }

    throw error;
  }

  redirect("/app?teamInviteAccepted=1");
}
