import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import { resolveLandingDestination } from "@/modules/access-control/landing";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";

export default async function AppHomePage() {
  const context = await loadActiveAppContext();
  const teamMemberships = await withDatabase((database) =>
    listTeamMembershipsForUserInOrganization(database, {
      organizationId: context.membership.organizationId,
      userId: context.user.id,
    }),
  );
  const destination = resolveLandingDestination({
    organizationRole: context.membership.organizationRole,
    teamMemberships: teamMemberships.map((membership) => ({
      teamId: membership.teamId,
      role: membership.teamRole,
    })),
  });

  redirect(destination.href);
}
