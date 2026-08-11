import "server-only";

import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { OrganizationRole } from "@/modules/access-control/roles";
import {
  organizationAuditEvents,
  organizationInvitations,
  organizations,
} from "@/modules/organizations/db/schema";

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
    .where(eq(organizationInvitations.token, token))
    .limit(1);

  return invitation ?? null;
}

export interface OrganizationAuditEventListItem {
  id: string;
  action: string;
  actorUserId: string;
  targetUserId: string | null;
  details: unknown;
  occurredAt: Date;
}

export async function listOrganizationAuditEventsByOrganizationId(
  database: Database,
  organizationId: string,
): Promise<OrganizationAuditEventListItem[]> {
  return database
    .select({
      id: organizationAuditEvents.id,
      action: organizationAuditEvents.action,
      actorUserId: organizationAuditEvents.actorUserId,
      targetUserId: organizationAuditEvents.targetUserId,
      details: organizationAuditEvents.details,
      occurredAt: organizationAuditEvents.occurredAt,
    })
    .from(organizationAuditEvents)
    .where(eq(organizationAuditEvents.organizationId, organizationId))
    .orderBy(asc(organizationAuditEvents.occurredAt));
}

export async function findOrganizationNameById(
  database: Database,
  organizationId: string,
): Promise<string | null> {
  const [organization] = await database
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return organization?.name ?? null;
}
