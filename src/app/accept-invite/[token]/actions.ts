"use server";

import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { loadAuthenticatedUser } from "@/lib/app-context";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import { acceptOrganizationInvitation } from "@/modules/organizations/application/organization-service";
import { createOrganizationUnitOfWork } from "@/modules/organizations/db/unit-of-work";

export async function acceptOrganizationInvitationAction(
  token: string,
): Promise<void> {
  const user = await loadAuthenticatedUser({
    signInRedirect: `/sign-in?redirect_url=/accept-invite/${token}`,
  });

  try {
    await withDatabase(async (database) => {
      await acceptOrganizationInvitation(
        createOrganizationUnitOfWork(database),
        {
          actorUserId: user.id,
          actorEmail: user.email,
          invitationToken: token,
        },
      );
    });
  } catch (error) {
    if (
      error instanceof ResourceNotFoundError ||
      error instanceof DomainInvariantError ||
      error instanceof AuthorizationError
    ) {
      redirect(`/accept-invite/${token}?error=invite_invalid`);
    }

    throw error;
  }

  redirect("/app?inviteAccepted=1");
}
