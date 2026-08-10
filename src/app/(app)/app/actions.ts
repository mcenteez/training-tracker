"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  createOrganizationInvitation,
  revokeOrganizationInvitation,
} from "@/modules/organizations/application/organization-service";
import { createOrganizationUnitOfWork } from "@/modules/organizations/db/unit-of-work";
import {
  addOrUpdateTeamMember,
  createTeam,
  removeTeamMember,
} from "@/modules/teams/application/team-service";
import { createTeamUnitOfWork } from "@/modules/teams/db/unit-of-work";
import { getAuthenticatedUserContext } from "@/modules/users/application/user-service";
import { teamRoles } from "@/modules/access-control/roles";

const createTeamInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Team name must be at least 2 characters")
    .max(120, "Team name must be at most 120 characters"),
});

const updateTeamMemberInputSchema = z.object({
  teamId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(teamRoles),
});

const removeTeamMemberInputSchema = z.object({
  teamId: z.uuid(),
  userId: z.uuid(),
});

const inviteOrganizationMemberInputSchema = z.object({
  invitedEmail: z.email(),
  role: z.enum(["manager", "viewer", "athlete"]),
});

const revokeInvitationInputSchema = z.object({
  invitationId: z.uuid(),
});

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

export async function createTeamAction(formData: FormData): Promise<void> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const parsedInput = createTeamInputSchema.safeParse({
    name: formData.get("teamName"),
  });

  if (!parsedInput.success) {
    redirect("/app?error=invalid_team_name");
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);

  if (!email) {
    redirect("/app?error=missing_email");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: userId,
        email,
      });

      if (!userContext.organizationId) {
        redirect("/onboarding/organization");
      }

      await createTeam(createTeamUnitOfWork(database), {
        organizationId: userContext.organizationId,
        actorUserId: userContext.id,
        name: parsedInput.data.name,
      });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app?error=forbidden");
    }

    throw error;
  }

  redirect("/app?created=1");
}

async function loadActorContext(): Promise<{
  userId: string;
  email: string;
}> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);

  if (!email) {
    redirect("/app?error=missing_email");
  }

  return { userId, email };
}

export async function addOrUpdateTeamMemberAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActorContext();

  const parsedInput = updateTeamMemberInputSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    redirect("/app?error=invalid_team_member_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
      });

      if (!userContext.organizationId) {
        redirect("/onboarding/organization");
      }

      await addOrUpdateTeamMember(createTeamUnitOfWork(database), {
        organizationId: userContext.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: userContext.id,
        targetUserId: parsedInput.data.userId,
        role: parsedInput.data.role,
      });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app?error=forbidden_member_manage");
    }

    throw error;
  }

  redirect("/app?memberSaved=1");
}

export async function removeTeamMemberAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActorContext();

  const parsedInput = removeTeamMemberInputSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });

  if (!parsedInput.success) {
    redirect("/app?error=invalid_team_member_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
      });

      if (!userContext.organizationId) {
        redirect("/onboarding/organization");
      }

      await removeTeamMember(createTeamUnitOfWork(database), {
        organizationId: userContext.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: userContext.id,
        targetUserId: parsedInput.data.userId,
      });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app?error=forbidden_member_manage");
    }

    throw error;
  }

  redirect("/app?memberRemoved=1");
}

export async function inviteOrganizationMemberAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActorContext();

  const parsedInput = inviteOrganizationMemberInputSchema.safeParse({
    invitedEmail: formData.get("invitedEmail"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    redirect("/app?error=invalid_invite_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
      });

      if (!userContext.organizationId) {
        redirect("/onboarding/organization");
      }

      await createOrganizationInvitation(
        createOrganizationUnitOfWork(database),
        {
          organizationId: userContext.organizationId,
          actorUserId: userContext.id,
          invitedEmail: parsedInput.data.invitedEmail,
          invitedRole: parsedInput.data.role,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        },
      );
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app?error=forbidden_invite_manage");
    }

    if (error instanceof DomainInvariantError) {
      redirect("/app?error=duplicate_invite");
    }

    throw error;
  }

  redirect("/app?inviteCreated=1");
}

export async function revokeOrganizationInvitationAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActorContext();

  const parsedInput = revokeInvitationInputSchema.safeParse({
    invitationId: formData.get("invitationId"),
  });

  if (!parsedInput.success) {
    redirect("/app?error=invalid_invite_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
      });

      if (!userContext.organizationId) {
        redirect("/onboarding/organization");
      }

      await revokeOrganizationInvitation(
        createOrganizationUnitOfWork(database),
        {
          organizationId: userContext.organizationId,
          actorUserId: userContext.id,
          invitationId: parsedInput.data.invitationId,
        },
      );
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app?error=forbidden_invite_manage");
    }

    if (
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect("/app?error=invite_not_found");
    }

    throw error;
  }

  redirect("/app?inviteRevoked=1");
}
