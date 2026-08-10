import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { teams } from "@/modules/teams/db/schema";
import { users } from "@/modules/users/db/schema";
import { teamMemberships } from "./schema";

export interface TeamListItem {
  id: string;
  name: string;
}

export async function listTeamsByOrganizationId(
  database: Database,
  organizationId: string,
): Promise<TeamListItem[]> {
  return database
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.organizationId, organizationId))
    .orderBy(asc(teams.name));
}

export interface OrganizationMemberListItem {
  userId: string;
  email: string;
  organizationRole: OrganizationRole;
}

export async function listOrganizationMembersByOrganizationId(
  database: Database,
  organizationId: string,
): Promise<OrganizationMemberListItem[]> {
  return database
    .select({
      userId: organizationMemberships.userId,
      email: users.email,
      organizationRole: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(users.email));
}

export interface TeamMemberListItem {
  teamId: string;
  userId: string;
  email: string;
  teamRole: TeamRole;
}

export async function listTeamMembersByOrganizationId(
  database: Database,
  organizationId: string,
): Promise<TeamMemberListItem[]> {
  return database
    .select({
      teamId: teamMemberships.teamId,
      userId: teamMemberships.userId,
      email: users.email,
      teamRole: teamMemberships.role,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .where(eq(teamMemberships.organizationId, organizationId))
    .orderBy(asc(users.email));
}

export async function findTeamRoleForUser(
  database: Database,
  input: { organizationId: string; teamId: string; userId: string },
): Promise<TeamRole | null> {
  const [membership] = await database
    .select({ teamRole: teamMemberships.role })
    .from(teamMemberships)
    .where(
      and(
        eq(teamMemberships.organizationId, input.organizationId),
        eq(teamMemberships.teamId, input.teamId),
        eq(teamMemberships.userId, input.userId),
      ),
    )
    .limit(1);

  return membership?.teamRole ?? null;
}
