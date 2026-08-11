"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
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

export async function createTeamAction(formData: FormData): Promise<void> {
  const parsedInput = createTeamInputSchema.safeParse({
    name: formData.get("teamName"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_team_name");
  }

  const actor = await loadActiveAppContext();

  try {
    await withDatabase(async (database) => {
      await createTeam(createTeamUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        actorUserId: actor.user.id,
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

export async function addOrUpdateTeamMemberAction(
  formData: FormData,
): Promise<void> {
  const actor = await loadActiveAppContext();

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
      await addOrUpdateTeamMember(createTeamUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: actor.user.id,
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
  const actor = await loadActiveAppContext();

  const parsedInput = removeTeamMemberInputSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_team_member_input");
  }

  try {
    await withDatabase(async (database) => {
      await removeTeamMember(createTeamUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: actor.user.id,
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
  const actor = await loadActiveAppContext();

  const parsedInput = inviteOrganizationMemberInputSchema.safeParse({
    invitedEmail: formData.get("invitedEmail"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_invite_input");
  }

  try {
    await withDatabase(async (database) => {
      await createOrganizationInvitation(
        createOrganizationUnitOfWork(database),
        {
          organizationId: actor.membership.organizationId,
          actorUserId: actor.user.id,
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
  const actor = await loadActiveAppContext();

  const parsedInput = revokeInvitationInputSchema.safeParse({
    invitationId: formData.get("invitationId"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_invite_input");
  }

  try {
    await withDatabase(async (database) => {
      await revokeOrganizationInvitation(
        createOrganizationUnitOfWork(database),
        {
          organizationId: actor.membership.organizationId,
          actorUserId: actor.user.id,
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
  const actor = await loadActiveAppContext();

  const parsedInput = updateOrganizationMemberRoleInputSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_org_member_input");
  }

  try {
    await withDatabase(async (database) => {
      await updateOrganizationMembershipRole(
        createOrganizationUnitOfWork(database),
        {
          organizationId: actor.membership.organizationId,
          actorUserId: actor.user.id,
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
  const actor = await loadActiveAppContext();

  const parsedInput = removeOrganizationMemberInputSchema.safeParse({
    userId: formData.get("userId"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_org_member_input");
  }

  try {
    await withDatabase(async (database) => {
      await removeOrganizationMember(createOrganizationUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        actorUserId: actor.user.id,
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
  const actor = await loadActiveAppContext();

  const parsedInput = transferOwnershipInputSchema.safeParse({
    newOwnerUserId: formData.get("newOwnerUserId"),
    previousOwnerRole: formData.get("previousOwnerRole"),
  });

  if (!parsedInput.success) {
    redirect("/app/admin?error=invalid_org_member_input");
  }

  try {
    await withDatabase(async (database) => {
      await transferOrganizationOwnership(
        createOrganizationUnitOfWork(database),
        {
          organizationId: actor.membership.organizationId,
          actorUserId: actor.user.id,
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
