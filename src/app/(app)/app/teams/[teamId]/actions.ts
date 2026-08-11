"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import { teamRoles } from "@/modules/access-control/roles";
import {
  createTeamInvitation,
  revokeTeamInvitation,
} from "@/modules/teams/application/team-invitation-service";
import {
  addOrUpdateTeamMember,
  removeTeamMember,
  updateTeam,
} from "@/modules/teams/application/team-service";
import { findOrganizationMemberByEmail } from "@/modules/teams/db/queries";
import { createTeamInvitationUnitOfWork } from "@/modules/teams/db/team-invitation-unit-of-work";
import { createTeamUnitOfWork } from "@/modules/teams/db/unit-of-work";

const updateTeamInputSchema = z.object({
  teamId: z.uuid(),
  name: z.string().trim().min(2).max(120),
});

const addTeamMemberInputSchema = z.object({
  teamId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(teamRoles),
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

const createTeamInvitationInputSchema = z.object({
  teamId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(teamRoles),
});

const revokeTeamInvitationInputSchema = z.object({
  teamId: z.uuid(),
  invitationId: z.uuid(),
});

function revalidateTeamSurfaces(teamId: string): void {
  revalidatePath("/app/teams");
  revalidatePath(`/app/teams/${teamId}`);
  revalidatePath(`/app/performance/teams/${teamId}`);
}

export async function updateTeamAction(formData: FormData): Promise<void> {
  const parsedInput = updateTeamInputSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("teamName"),
  });

  if (!parsedInput.success) {
    redirect("/app/teams?error=invalid_team_input");
  }

  const actor = await loadActiveAppContext();
  const teamPath = `/app/teams/${parsedInput.data.teamId}`;

  try {
    await withDatabase((database) =>
      updateTeam(createTeamUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: actor.user.id,
        name: parsedInput.data.name,
      }),
    );
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect(`${teamPath}?error=team_update_unavailable`);
    }

    throw error;
  }

  revalidateTeamSurfaces(parsedInput.data.teamId);
  redirect(`${teamPath}?updated=1`);
}

export async function addTeamMemberAction(formData: FormData): Promise<void> {
  const parsedInput = addTeamMemberInputSchema.safeParse({
    teamId: formData.get("teamId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    redirect("/app/teams?error=invalid_team_member_input");
  }

  const actor = await loadActiveAppContext();
  const teamPath = `/app/teams/${parsedInput.data.teamId}`;

  try {
    await withDatabase(async (database) => {
      const member = await findOrganizationMemberByEmail(database, {
        organizationId: actor.membership.organizationId,
        email: parsedInput.data.email,
      });

      if (!member) {
        redirect(`${teamPath}?error=member_not_found`);
      }

      await addOrUpdateTeamMember(createTeamUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: actor.user.id,
        targetUserId: member.userId,
        role: parsedInput.data.role,
      });
    });
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect(`${teamPath}?error=member_update_unavailable`);
    }

    throw error;
  }

  revalidateTeamSurfaces(parsedInput.data.teamId);
  redirect(`${teamPath}?memberSaved=1`);
}

export async function updateTeamMemberAction(
  formData: FormData,
): Promise<void> {
  const parsedInput = updateTeamMemberInputSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    redirect("/app/teams?error=invalid_team_member_input");
  }

  const actor = await loadActiveAppContext();
  const teamPath = `/app/teams/${parsedInput.data.teamId}`;

  try {
    await withDatabase((database) =>
      addOrUpdateTeamMember(createTeamUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: actor.user.id,
        targetUserId: parsedInput.data.userId,
        role: parsedInput.data.role,
      }),
    );
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect(`${teamPath}?error=member_update_unavailable`);
    }

    throw error;
  }

  revalidateTeamSurfaces(parsedInput.data.teamId);
  redirect(`${teamPath}?memberSaved=1`);
}

export async function removeTeamMemberAction(
  formData: FormData,
): Promise<void> {
  const parsedInput = removeTeamMemberInputSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });

  if (!parsedInput.success) {
    redirect("/app/teams?error=invalid_team_member_input");
  }

  const actor = await loadActiveAppContext();
  const teamPath = `/app/teams/${parsedInput.data.teamId}`;

  try {
    await withDatabase((database) =>
      removeTeamMember(createTeamUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: actor.user.id,
        targetUserId: parsedInput.data.userId,
      }),
    );
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect(`${teamPath}?error=member_update_unavailable`);
    }

    throw error;
  }

  revalidateTeamSurfaces(parsedInput.data.teamId);
  redirect(`${teamPath}?memberRemoved=1`);
}

export async function createTeamInvitationAction(
  formData: FormData,
): Promise<void> {
  const parsedInput = createTeamInvitationInputSchema.safeParse({
    teamId: formData.get("teamId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    redirect("/app/teams?error=invalid_team_invitation_input");
  }

  const actor = await loadActiveAppContext();
  const teamPath = `/app/teams/${parsedInput.data.teamId}`;
  let token: string;

  try {
    const result = await withDatabase((database) =>
      createTeamInvitation(createTeamInvitationUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: actor.user.id,
        invitedEmail: parsedInput.data.email,
        role: parsedInput.data.role,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );
    token = result.token;
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect(`${teamPath}?error=invitation_create_unavailable`);
    }

    throw error;
  }

  revalidateTeamSurfaces(parsedInput.data.teamId);
  redirect(`${teamPath}?inviteToken=${encodeURIComponent(token)}`);
}

export async function revokeTeamInvitationAction(
  formData: FormData,
): Promise<void> {
  const parsedInput = revokeTeamInvitationInputSchema.safeParse({
    teamId: formData.get("teamId"),
    invitationId: formData.get("invitationId"),
  });

  if (!parsedInput.success) {
    redirect("/app/teams?error=invalid_team_invitation_input");
  }

  const actor = await loadActiveAppContext();
  const teamPath = `/app/teams/${parsedInput.data.teamId}`;

  try {
    await withDatabase((database) =>
      revokeTeamInvitation(createTeamInvitationUnitOfWork(database), {
        organizationId: actor.membership.organizationId,
        teamId: parsedInput.data.teamId,
        actorUserId: actor.user.id,
        invitationId: parsedInput.data.invitationId,
      }),
    );
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof DomainInvariantError ||
      error instanceof ResourceNotFoundError
    ) {
      redirect(`${teamPath}?error=invitation_revoke_unavailable`);
    }

    throw error;
  }

  revalidateTeamSurfaces(parsedInput.data.teamId);
  redirect(`${teamPath}?invitationRevoked=1`);
}
