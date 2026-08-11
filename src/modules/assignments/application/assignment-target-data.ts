import "server-only";

import type { Database } from "@/db/client";
import {
  listAssignmentTargetTeamMembers,
  listOrganizationMembersByOrganizationId,
  listTeamMembersByOrganizationId,
  listTeamsByIdsInOrganization,
  listTeamsByOrganizationId,
  type OrganizationMemberListItem,
} from "@/modules/teams/db/queries";

export async function listAssignmentTargetData(
  database: Database,
  input: { organizationId: string; managedTeamIds?: readonly string[] },
) {
  if (input.managedTeamIds === undefined) {
    const [teams, members, teamMembers] = await Promise.all([
      listTeamsByOrganizationId(database, input.organizationId),
      listOrganizationMembersByOrganizationId(database, input.organizationId),
      listTeamMembersByOrganizationId(database, input.organizationId),
    ]);

    return { teams, members, teamMembers };
  }

  const [teams, teamMembers] = await Promise.all([
    listTeamsByIdsInOrganization(database, {
      organizationId: input.organizationId,
      teamIds: input.managedTeamIds,
    }),
    listAssignmentTargetTeamMembers(database, {
      organizationId: input.organizationId,
      teamIds: input.managedTeamIds,
    }),
  ]);
  const membersById = new Map<string, OrganizationMemberListItem>();

  for (const member of teamMembers) {
    membersById.set(member.userId, {
      userId: member.userId,
      email: member.email,
      fullName: member.fullName,
      organizationRole: member.organizationRole,
    });
  }

  return {
    teams,
    members: [...membersById.values()],
    teamMembers,
  };
}
