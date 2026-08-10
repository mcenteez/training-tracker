"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import { getAuthenticatedUserContext } from "@/modules/users/application/user-service";
import { acceptOrganizationInvitation } from "@/modules/organizations/application/organization-service";
import { createOrganizationUnitOfWork } from "@/modules/organizations/db/unit-of-work";

function getPrimaryEmailAddress(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | null {
  if (!user) {
    return null;
  }

  const primaryEmailAddress = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
  );

  return (
    primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

export async function acceptOrganizationInvitationAction(
  token: string,
): Promise<void> {
  const { userId } = await auth();

  if (!userId) {
    redirect(`/sign-in?redirect_url=/accept-invite/${token}`);
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);

  if (!email) {
    redirect(`/accept-invite/${token}?error=missing_email`);
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: userId,
        email,
      });

      await acceptOrganizationInvitation(
        createOrganizationUnitOfWork(database),
        {
          actorUserId: userContext.id,
          actorEmail: email,
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
