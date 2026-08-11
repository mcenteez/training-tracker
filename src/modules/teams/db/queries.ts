import "server-only";

import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";
import { hashTeamInvitationToken } from "@/modules/teams/application/team-invitation-token";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { teamInvitations, teams } from "@/modules/teams/db/schema";
import { users } from "@/modules/users/db/schema";
import { teamMemberships } from "./schema";

export interface TeamListItem {
  id: string;
  name: string;
}

export interface AthleteAssignedTeamListItem {
  teamId: string;
  teamName: string;
  teamRole: TeamRole;
}

export interface UserTeamMembershipListItem {
  teamId: string;
  teamName: string;
  teamRole: TeamRole;
}

export async function listTeamMembershipsForUserInOrganization(
  database: Database,
  input: { organizationId: string; userId: string },
): Promise<UserTeamMembershipListItem[]> {
  return database
    .select({
      teamId: teamMemberships.teamId,
      teamName: teams.name,
      teamRole: teamMemberships.role,
    })
    .from(teamMemberships)
    .innerJoin(
      teams,
      and(
        eq(teams.id, teamMemberships.teamId),
        eq(teams.organizationId, teamMemberships.organizationId),
      ),
    )
    .where(
      and(
        eq(teamMemberships.organizationId, input.organizationId),
        eq(teamMemberships.userId, input.userId),
      ),
    )
    .orderBy(asc(teams.name));
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

export async function listTeamsByIdsInOrganization(
  database: Database,
  input: { organizationId: string; teamIds: readonly string[] },
): Promise<TeamListItem[]> {
  if (input.teamIds.length === 0) {
    return [];
  }

  return database
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(
      and(
        eq(teams.organizationId, input.organizationId),
        inArray(teams.id, input.teamIds),
      ),
    )
    .orderBy(asc(teams.name));
}

export async function findTeamByOrganizationId(
  database: Database,
  input: { organizationId: string; teamId: string },
): Promise<TeamListItem | null> {
  const [team] = await database
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(
      and(
        eq(teams.organizationId, input.organizationId),
        eq(teams.id, input.teamId),
      ),
    )
    .limit(1);

  return team ?? null;
}

export interface PendingTeamInvitationListItem {
  id: string;
  invitedEmail: string;
  role: TeamRole;
  expiresAt: Date;
  createdAt: Date;
}

export async function listPendingTeamInvitations(
  database: Database,
  input: { organizationId: string; teamId: string; now?: Date },
): Promise<PendingTeamInvitationListItem[]> {
  return database
    .select({
      id: teamInvitations.id,
      invitedEmail: teamInvitations.invitedEmail,
      role: teamInvitations.role,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
    })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.organizationId, input.organizationId),
        eq(teamInvitations.teamId, input.teamId),
        eq(teamInvitations.status, "pending"),
        gt(teamInvitations.expiresAt, input.now ?? new Date()),
      ),
    )
    .orderBy(asc(teamInvitations.invitedEmail));
}

export interface TeamInvitationPreview {
  teamName: string;
  role: TeamRole;
  isUsable: boolean;
}

export async function findTeamInvitationPreviewByToken(
  database: Database,
  token: string,
): Promise<TeamInvitationPreview | null> {
  const [invitation] = await database
    .select({
      teamName: teams.name,
      role: teamInvitations.role,
      isUsable: sql<boolean>`${teamInvitations.status} = 'pending' AND ${teamInvitations.expiresAt} > now()`,
    })
    .from(teamInvitations)
    .innerJoin(
      teams,
      and(
        eq(teams.organizationId, teamInvitations.organizationId),
        eq(teams.id, teamInvitations.teamId),
      ),
    )
    .where(eq(teamInvitations.tokenHash, hashTeamInvitationToken(token)))
    .limit(1);

  return invitation ?? null;
}

export interface OrganizationMemberListItem {
  userId: string;
  email: string;
  fullName: string | null;
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
      fullName: users.fullName,
      organizationRole: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(users.email));
}

export async function findOrganizationMemberByEmail(
  database: Database,
  input: { organizationId: string; email: string },
): Promise<OrganizationMemberListItem | null> {
  const [member] = await database
    .select({
      userId: organizationMemberships.userId,
      email: users.email,
      fullName: users.fullName,
      organizationRole: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, input.organizationId),
        sql`lower(${users.email}) = ${input.email.trim().toLowerCase()}`,
      ),
    )
    .limit(1);

  return member ?? null;
}

export interface TeamMemberListItem {
  teamId: string;
  userId: string;
  email: string;
  fullName: string | null;
  teamRole: TeamRole;
}

export interface AssignmentTargetTeamMemberListItem extends TeamMemberListItem {
  organizationRole: OrganizationRole;
}

export async function listAssignmentTargetTeamMembers(
  database: Database,
  input: { organizationId: string; teamIds: readonly string[] },
): Promise<AssignmentTargetTeamMemberListItem[]> {
  if (input.teamIds.length === 0) {
    return [];
  }

  return database
    .select({
      teamId: teamMemberships.teamId,
      userId: teamMemberships.userId,
      email: users.email,
      fullName: users.fullName,
      teamRole: teamMemberships.role,
      organizationRole: organizationMemberships.role,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .innerJoin(
      organizationMemberships,
      and(
        eq(
          organizationMemberships.organizationId,
          teamMemberships.organizationId,
        ),
        eq(organizationMemberships.userId, teamMemberships.userId),
      ),
    )
    .where(
      and(
        eq(teamMemberships.organizationId, input.organizationId),
        inArray(teamMemberships.teamId, input.teamIds),
      ),
    )
    .orderBy(asc(users.email), asc(teamMemberships.teamId));
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
      fullName: users.fullName,
      teamRole: teamMemberships.role,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .where(eq(teamMemberships.organizationId, organizationId))
    .orderBy(asc(users.email));
}

export async function listTeamMembersByTeamId(
  database: Database,
  input: { organizationId: string; teamId: string },
): Promise<TeamMemberListItem[]> {
  return database
    .select({
      teamId: teamMemberships.teamId,
      userId: teamMemberships.userId,
      email: users.email,
      fullName: users.fullName,
      teamRole: teamMemberships.role,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .where(
      and(
        eq(teamMemberships.organizationId, input.organizationId),
        eq(teamMemberships.teamId, input.teamId),
      ),
    )
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

export async function listTeamsForAthleteUser(
  database: Database,
  input: { organizationId: string; userId: string },
): Promise<AthleteAssignedTeamListItem[]> {
  return listTeamMembershipsForUserInOrganization(database, input);
}
