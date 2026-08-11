import "server-only";

import { notFound } from "next/navigation";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext, type ActiveAppContext } from "@/lib/app-context";
import {
  hasPermission,
  type AccessContext,
  type Permission,
} from "@/modules/access-control/permissions";
import type { TeamRole } from "@/modules/access-control/roles";
import {
  findTeamByOrganizationId,
  findTeamRoleForUser,
  type TeamListItem,
} from "@/modules/teams/db/queries";

export interface AuthorizedTeamContext extends ActiveAppContext {
  team: TeamListItem;
  teamRole: TeamRole | null;
  access: AccessContext;
}

export function resolveAuthorizedTeamContext(input: {
  context: ActiveAppContext;
  team: TeamListItem | null;
  teamRole: TeamRole | null;
  permission: Permission;
}): AuthorizedTeamContext | null {
  if (!input.team) {
    return null;
  }

  const access: AccessContext = {
    organizationRole: input.context.membership.organizationRole,
    teamRole: input.teamRole,
  };

  if (!hasPermission(access, input.permission)) {
    return null;
  }

  return {
    ...input.context,
    team: input.team,
    teamRole: input.teamRole,
    access,
  };
}

export async function loadAuthorizedTeamContext(
  teamId: string,
  permission: Permission,
): Promise<AuthorizedTeamContext> {
  const context = await loadActiveAppContext();
  const organizationId = context.membership.organizationId;
  const [team, teamRole] = await withDatabase((database) =>
    Promise.all([
      findTeamByOrganizationId(database, { organizationId, teamId }),
      findTeamRoleForUser(database, {
        organizationId,
        teamId,
        userId: context.user.id,
      }),
    ]),
  );
  const authorizedContext = resolveAuthorizedTeamContext({
    context,
    team,
    teamRole,
    permission,
  });

  if (!authorizedContext) {
    notFound();
  }

  return authorizedContext;
}
