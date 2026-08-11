"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { requireOrganizationAccess } from "@/modules/access-control/guards";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  createOrganizationInvitation,
  removeOrganizationMember,
  revokeOrganizationInvitation,
  transferOrganizationOwnership,
  updateOrganizationMembershipRole,
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

const updateOrganizationMemberRoleInputSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["manager", "viewer", "athlete"]),
});

const removeOrganizationMemberInputSchema = z.object({
  userId: z.uuid(),
});

const transferOwnershipInputSchema = z.object({
  newOwnerUserId: z.uuid(),
  previousOwnerRole: z.enum(["manager", "viewer", "athlete"]),
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

function getFullName(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | null {
  if (!user) {
    return null;
  }

  const candidate = user.fullName?.trim();
  if (candidate) {
    return candidate;
  }

  const fallback = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();

  return fallback || null;
}

function requireOrganizationIdOrRedirect(context: {
  organizationId: string | null;
}): string {
  try {
    return requireOrganizationAccess(context);
  } catch {
    redirect("/onboarding/organization");
  }
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
    redirect("/app/admin?error=invalid_team_name");
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);
  const fullName = getFullName(user);

  if (!email) {
    redirect("/app/admin?error=missing_email");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: userId,
        email,
        fullName,
      });

      const organizationId = requireOrganizationIdOrRedirect(userContext);

      await createTeam(createTeamUnitOfWork(database), {
        organizationId,
        actorUserId: userContext.id,
        name: parsedInput.data.name,
      });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app/admin?error=forbidden");
    }

    throw error;
  }

  redirect("/app/admin?created=1");
}

async function loadActorContext(): Promise<{
  userId: string;
  email: string;
  fullName: string | null;
}> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);
  const fullName = getFullName(user);

  if (!email) {
    redirect("/app/admin?error=missing_email");
  }

  return { userId, email, fullName };
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
    redirect("/app/admin?error=invalid_team_member_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
      });

      const organizationId = requireOrganizationIdOrRedirect(userContext);

      await addOrUpdateTeamMember(createTeamUnitOfWork(database), {
        organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: userContext.id,
        targetUserId: parsedInput.data.userId,
        role: parsedInput.data.role,
      });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app/admin?error=forbidden_member_manage");
    }

    throw error;
  }

  redirect("/app/admin?memberSaved=1");
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
    redirect("/app/admin?error=invalid_team_member_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
      });

      const organizationId = requireOrganizationIdOrRedirect(userContext);

      await removeTeamMember(createTeamUnitOfWork(database), {
        organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: userContext.id,
        targetUserId: parsedInput.data.userId,
      });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app/admin?error=forbidden_member_manage");
    }

    throw error;
  }

  redirect("/app/admin?memberRemoved=1");
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
    redirect("/app/admin?error=invalid_invite_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
      });

      const organizationId = requireOrganizationIdOrRedirect(userContext);

      await createOrganizationInvitation(
        createOrganizationUnitOfWork(database),
        {
          organizationId,
          actorUserId: userContext.id,
          invitedEmail: parsedInput.data.invitedEmail,
          invitedRole: parsedInput.data.role,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        },
      );
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app/admin?error=forbidden_invite_manage");
    }

    if (error instanceof DomainInvariantError) {
      redirect("/app/admin?error=duplicate_invite");
    }

    throw error;
  }

  redirect("/app/admin?inviteCreated=1");
}

export async function revokeOrganizationInvitationAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActorContext();

  const parsedInput = revokeInvitationInputSchema.safeParse({
    invitationId: formData.get("invitationId"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_invite_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
      });

      const organizationId = requireOrganizationIdOrRedirect(userContext);

      await revokeOrganizationInvitation(
        createOrganizationUnitOfWork(database),
        {
          organizationId,
          actorUserId: userContext.id,
          invitationId: parsedInput.data.invitationId,
        },
      );
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app/admin?error=forbidden_invite_manage");
    }

    if (
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect("/app/admin?error=invite_not_found");
    }

    throw error;
  }

  redirect("/app/admin?inviteRevoked=1");
}

export async function updateOrganizationMemberRoleAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActorContext();

  const parsedInput = updateOrganizationMemberRoleInputSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_org_member_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
      });

      const organizationId = requireOrganizationIdOrRedirect(userContext);

      await updateOrganizationMembershipRole(
        createOrganizationUnitOfWork(database),
        {
          organizationId,
          actorUserId: userContext.id,
          targetUserId: parsedInput.data.userId,
          role: parsedInput.data.role,
        },
      );
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app/admin?error=forbidden_org_member_manage");
    }

    throw error;
  }

  redirect("/app/admin?orgMemberUpdated=1");
}

export async function removeOrganizationMemberAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActorContext();

  const parsedInput = removeOrganizationMemberInputSchema.safeParse({
    userId: formData.get("userId"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_org_member_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
      });

      const organizationId = requireOrganizationIdOrRedirect(userContext);

      await removeOrganizationMember(createOrganizationUnitOfWork(database), {
        organizationId,
        actorUserId: userContext.id,
        targetUserId: parsedInput.data.userId,
      });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app/admin?error=forbidden_org_member_manage");
    }

    throw error;
  }

  redirect("/app/admin?orgMemberRemoved=1");
}

export async function transferOrganizationOwnershipAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActorContext();

  const parsedInput = transferOwnershipInputSchema.safeParse({
    newOwnerUserId: formData.get("newOwnerUserId"),
    previousOwnerRole: formData.get("previousOwnerRole"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_org_member_input");
  }

  try {
    await withDatabase(async (database) => {
      const userContext = await getAuthenticatedUserContext(database, {
        clerkUserId: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
      });

      const organizationId = requireOrganizationIdOrRedirect(userContext);

      await transferOrganizationOwnership(
        createOrganizationUnitOfWork(database),
        {
          organizationId,
          actorUserId: userContext.id,
          newOwnerUserId: parsedInput.data.newOwnerUserId,
          previousOwnerRole: parsedInput.data.previousOwnerRole,
        },
      );
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/app/admin?error=forbidden_org_member_manage");
    }

    throw error;
  }

  redirect("/app/admin?ownershipTransferred=1");
}
