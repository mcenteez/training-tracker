import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  OrganizationTransaction,
  OrganizationUnitOfWork,
} from "@/modules/organizations/application/organization-service";
import {
  organizationInvitations,
  organizationMemberships,
  organizations,
} from "@/modules/organizations/db/schema";

export function createOrganizationUnitOfWork(
  database: Database,
): OrganizationUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: OrganizationTransaction = {
          async createOrganization(name) {
            const [organization] = await databaseTransaction
              .insert(organizations)
              .values({ name })
              .returning({ id: organizations.id, name: organizations.name });

            if (!organization) {
              throw new Error("Failed to create organization");
            }

            return organization;
          },
          async addMembership(organizationId, userId, role) {
            await databaseTransaction.insert(organizationMemberships).values({
              organizationId,
              userId,
              role,
            });
          },
          async findMembershipRole(organizationId, userId) {
            const [membership] = await databaseTransaction
              .select({ role: organizationMemberships.role })
              .from(organizationMemberships)
              .where(
                and(
                  eq(organizationMemberships.organizationId, organizationId),
                  eq(organizationMemberships.userId, userId),
                ),
              )
              .limit(1);

            return membership?.role ?? null;
          },
          async updateMembershipRole(organizationId, userId, role) {
            await databaseTransaction
              .update(organizationMemberships)
              .set({ role, updatedAt: new Date() })
              .where(
                and(
                  eq(organizationMemberships.organizationId, organizationId),
                  eq(organizationMemberships.userId, userId),
                ),
              );
          },
          async upsertMembershipRole(organizationId, userId, role) {
            await databaseTransaction
              .insert(organizationMemberships)
              .values({ organizationId, userId, role })
              .onConflictDoUpdate({
                target: [
                  organizationMemberships.organizationId,
                  organizationMemberships.userId,
                ],
                set: { role, updatedAt: new Date() },
              });
          },
          async deleteMembership(organizationId, userId) {
            await databaseTransaction
              .delete(organizationMemberships)
              .where(
                and(
                  eq(organizationMemberships.organizationId, organizationId),
                  eq(organizationMemberships.userId, userId),
                ),
              );
          },
          async findPendingInvitationByEmail(organizationId, invitedEmail) {
            const [invitation] = await databaseTransaction
              .select({
                id: organizationInvitations.id,
                organizationId: organizationInvitations.organizationId,
                invitedEmail: organizationInvitations.invitedEmail,
                role: organizationInvitations.role,
                status: organizationInvitations.status,
                token: organizationInvitations.token,
                expiresAt: organizationInvitations.expiresAt,
                createdByUserId: organizationInvitations.createdByUserId,
                acceptedByUserId: organizationInvitations.acceptedByUserId,
                acceptedAt: organizationInvitations.acceptedAt,
                revokedAt: organizationInvitations.revokedAt,
              })
              .from(organizationInvitations)
              .where(
                and(
                  eq(organizationInvitations.organizationId, organizationId),
                  eq(organizationInvitations.invitedEmail, invitedEmail),
                  eq(organizationInvitations.status, "pending"),
                ),
              )
              .limit(1);

            return invitation ?? null;
          },
          async createInvitation(input) {
            const [invitation] = await databaseTransaction
              .insert(organizationInvitations)
              .values({
                organizationId: input.organizationId,
                invitedEmail: input.invitedEmail,
                role: input.role,
                token: input.token,
                expiresAt: input.expiresAt,
                createdByUserId: input.createdByUserId,
              })
              .returning({
                id: organizationInvitations.id,
                organizationId: organizationInvitations.organizationId,
                invitedEmail: organizationInvitations.invitedEmail,
                role: organizationInvitations.role,
                status: organizationInvitations.status,
                token: organizationInvitations.token,
                expiresAt: organizationInvitations.expiresAt,
                createdByUserId: organizationInvitations.createdByUserId,
                acceptedByUserId: organizationInvitations.acceptedByUserId,
                acceptedAt: organizationInvitations.acceptedAt,
                revokedAt: organizationInvitations.revokedAt,
              });

            if (!invitation) {
              throw new Error("Failed to create organization invitation");
            }

            return invitation;
          },
          async findInvitationById(organizationId, invitationId) {
            const [invitation] = await databaseTransaction
              .select({
                id: organizationInvitations.id,
                organizationId: organizationInvitations.organizationId,
                invitedEmail: organizationInvitations.invitedEmail,
                role: organizationInvitations.role,
                status: organizationInvitations.status,
                token: organizationInvitations.token,
                expiresAt: organizationInvitations.expiresAt,
                createdByUserId: organizationInvitations.createdByUserId,
                acceptedByUserId: organizationInvitations.acceptedByUserId,
                acceptedAt: organizationInvitations.acceptedAt,
                revokedAt: organizationInvitations.revokedAt,
              })
              .from(organizationInvitations)
              .where(
                and(
                  eq(organizationInvitations.organizationId, organizationId),
                  eq(organizationInvitations.id, invitationId),
                ),
              )
              .limit(1);

            return invitation ?? null;
          },
          async findInvitationByToken(token) {
            const [invitation] = await databaseTransaction
              .select({
                id: organizationInvitations.id,
                organizationId: organizationInvitations.organizationId,
                invitedEmail: organizationInvitations.invitedEmail,
                role: organizationInvitations.role,
                status: organizationInvitations.status,
                token: organizationInvitations.token,
                expiresAt: organizationInvitations.expiresAt,
                createdByUserId: organizationInvitations.createdByUserId,
                acceptedByUserId: organizationInvitations.acceptedByUserId,
                acceptedAt: organizationInvitations.acceptedAt,
                revokedAt: organizationInvitations.revokedAt,
              })
              .from(organizationInvitations)
              .where(eq(organizationInvitations.token, token))
              .limit(1);

            return invitation ?? null;
          },
          async markInvitationRevoked(invitationId, revokedAt) {
            await databaseTransaction
              .update(organizationInvitations)
              .set({
                status: "revoked",
                revokedAt,
                updatedAt: revokedAt,
              })
              .where(eq(organizationInvitations.id, invitationId));
          },
          async markInvitationExpired(invitationId, expiredAt) {
            await databaseTransaction
              .update(organizationInvitations)
              .set({
                status: "expired",
                updatedAt: expiredAt,
              })
              .where(eq(organizationInvitations.id, invitationId));
          },
          async markInvitationAccepted(input) {
            await databaseTransaction
              .update(organizationInvitations)
              .set({
                status: "accepted",
                acceptedByUserId: input.acceptedByUserId,
                acceptedAt: input.acceptedAt,
                updatedAt: input.acceptedAt,
              })
              .where(eq(organizationInvitations.id, input.invitationId));
          },
        };

        return operation(transaction);
      }),
  };
}
