"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import { updateTeam } from "@/modules/teams/application/team-service";
import { createTeamUnitOfWork } from "@/modules/teams/db/unit-of-work";

const updateTeamInputSchema = z.object({
  teamId: z.uuid(),
  name: z.string().trim().min(2).max(120),
});

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

  revalidatePath("/app/teams");
  revalidatePath(teamPath);
  revalidatePath(`/app/performance/teams/${parsedInput.data.teamId}`);
  redirect(`${teamPath}?updated=1`);
}
