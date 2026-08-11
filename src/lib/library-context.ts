import "server-only";

import { cache } from "react";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  resolveLibraryAccess,
  type LibraryAccess,
} from "@/modules/access-control/library-access";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";

export const loadLibraryAppContext = cache(async () => {
  const context = await loadActiveAppContext();
  const teamMemberships = await withDatabase((database) =>
    listTeamMembershipsForUserInOrganization(database, {
      organizationId: context.membership.organizationId,
      userId: context.user.id,
    }),
  );
  const libraryAccess: LibraryAccess = resolveLibraryAccess({
    organizationRole: context.membership.organizationRole,
    teamRoles: teamMemberships.map((membership) => membership.teamRole),
  });

  return { ...context, teamMemberships, libraryAccess };
});
