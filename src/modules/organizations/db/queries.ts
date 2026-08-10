import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { OrganizationRole } from "@/modules/access-control/roles";
import { organizationInvitations } from "@/modules/organizations/db/schema";

type OrganizationInvitationStatus =
  "pending" | "accepted" | "revoked" | "expired";

export interface OrganizationInvitationListItem {
  id: string;
  invitedEmail: string;
  role: OrganizationRole;
  status: OrganizationInvitationStatus;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export async function listOrganizationInvitationsByOrganizationId(
  database: Database,
  organizationId: string,
): Promise<OrganizationInvitationListItem[]> {
  return database
    .select({
      id: organizationInvitations.id,
      invitedEmail: organizationInvitations.invitedEmail,
      role: organizationInvitations.role,
      status: organizationInvitations.status,
      token: organizationInvitations.token,
      expiresAt: organizationInvitations.expiresAt,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .where(eq(organizationInvitations.organizationId, organizationId))
    .orderBy(asc(organizationInvitations.createdAt));
}

export interface InvitationTokenLookup {
  id: string;
  organizationId: string;
  invitedEmail: string;
  role: OrganizationRole;
  status: OrganizationInvitationStatus;
  expiresAt: Date;
}

export async function findInvitationByToken(
  database: Database,
  token: string,
): Promise<InvitationTokenLookup | null> {
  const [invitation] = await database
    .select({
      id: organizationInvitations.id,
      organizationId: organizationInvitations.organizationId,
      invitedEmail: organizationInvitations.invitedEmail,
      role: organizationInvitations.role,
      status: organizationInvitations.status,
      expiresAt: organizationInvitations.expiresAt,
    })
    .from(organizationInvitations)
    .where(and(eq(organizationInvitations.token, token)))
    .limit(1);

  return invitation ?? null;
}
