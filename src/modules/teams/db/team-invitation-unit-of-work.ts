import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  organizationAuditEvents,
  organizationMemberships,
} from "@/modules/organizations/db/schema";
import type {
  TeamInvitationTransaction,
  TeamInvitationUnitOfWork,
} from "@/modules/teams/application/team-invitation-service";
import {
  teamInvitations,
  teamMemberships,
  teams,
} from "@/modules/teams/db/schema";

const invitationSelection = {
  id: teamInvitations.id,
  organizationId: teamInvitations.organizationId,
  teamId: teamInvitations.teamId,
  invitedEmail: teamInvitations.invitedEmail,
  role: teamInvitations.role,
  status: teamInvitations.status,
  tokenHash: teamInvitations.tokenHash,
  expiresAt: teamInvitations.expiresAt,
  createdByUserId: teamInvitations.createdByUserId,
  acceptedByUserId: teamInvitations.acceptedByUserId,
  acceptedAt: teamInvitations.acceptedAt,
  revokedAt: teamInvitations.revokedAt,
};

export function createTeamInvitationUnitOfWork(
  database: Database,
): TeamInvitationUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: TeamInvitationTransaction = {
          async teamExists(organizationId, teamId) {
            const [team] = await databaseTransaction
              .select({ id: teams.id })
              .from(teams)
              .where(
                and(
                  eq(teams.organizationId, organizationId),
                  eq(teams.id, teamId),
                ),
              )
              .limit(1);
            return team !== undefined;
          },
          async findOrganizationRole(organizationId, userId) {
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
          async findTeamRole(organizationId, teamId, userId) {
            const [membership] = await databaseTransaction
              .select({ role: teamMemberships.role })
              .from(teamMemberships)
              .where(
                and(
                  eq(teamMemberships.organizationId, organizationId),
                  eq(teamMemberships.teamId, teamId),
                  eq(teamMemberships.userId, userId),
                ),
              )
              .limit(1);
            return membership?.role ?? null;
          },
          async findPendingInvitationByEmail(
            organizationId,
            teamId,
            invitedEmail,
          ) {
            const [invitation] = await databaseTransaction
              .select(invitationSelection)
              .from(teamInvitations)
              .where(
                and(
                  eq(teamInvitations.organizationId, organizationId),
                  eq(teamInvitations.teamId, teamId),
                  eq(teamInvitations.invitedEmail, invitedEmail),
                  eq(teamInvitations.status, "pending"),
                ),
              )
              .limit(1);
            return invitation ?? null;
          },
          async createInvitation(input) {
            const [invitation] = await databaseTransaction
              .insert(teamInvitations)
              .values(input)
              .returning(invitationSelection);

            if (!invitation) {
              throw new Error("Failed to create team invitation");
            }
            return invitation;
          },
          async findInvitationById(organizationId, teamId, invitationId) {
            const [invitation] = await databaseTransaction
              .select(invitationSelection)
              .from(teamInvitations)
              .where(
                and(
                  eq(teamInvitations.organizationId, organizationId),
                  eq(teamInvitations.teamId, teamId),
                  eq(teamInvitations.id, invitationId),
                ),
              )
              .limit(1);
            return invitation ?? null;
          },
          async findInvitationByTokenHashForUpdate(tokenHash) {
            const [invitation] = await databaseTransaction
              .select(invitationSelection)
              .from(teamInvitations)
              .where(eq(teamInvitations.tokenHash, tokenHash))
              .for("update")
              .limit(1);
            return invitation ?? null;
          },
          async markInvitationRevoked(invitationId, revokedAt) {
            await databaseTransaction
              .update(teamInvitations)
              .set({ status: "revoked", revokedAt, updatedAt: revokedAt })
              .where(
                and(
                  eq(teamInvitations.id, invitationId),
                  eq(teamInvitations.status, "pending"),
                ),
              );
          },
          async markInvitationExpired(invitationId, expiredAt) {
            await databaseTransaction
              .update(teamInvitations)
              .set({ status: "expired", updatedAt: expiredAt })
              .where(
                and(
                  eq(teamInvitations.id, invitationId),
                  eq(teamInvitations.status, "pending"),
                ),
              );
          },
          async markInvitationAccepted(input) {
            const [accepted] = await databaseTransaction
              .update(teamInvitations)
              .set({
                status: "accepted",
                acceptedByUserId: input.acceptedByUserId,
                acceptedAt: input.acceptedAt,
                updatedAt: input.acceptedAt,
              })
              .where(
                and(
                  eq(teamInvitations.id, input.invitationId),
                  eq(teamInvitations.status, "pending"),
                ),
              )
              .returning({ id: teamInvitations.id });
            return accepted !== undefined;
          },
          async addOrganizationAthlete(organizationId, userId) {
            await databaseTransaction
              .insert(organizationMemberships)
              .values({ organizationId, userId, role: "athlete" })
              .onConflictDoNothing({
                target: [
                  organizationMemberships.organizationId,
                  organizationMemberships.userId,
                ],
              });
          },
          async upsertTeamMembership(organizationId, teamId, userId, role) {
            await databaseTransaction
              .insert(teamMemberships)
              .values({ organizationId, teamId, userId, role })
              .onConflictDoUpdate({
                target: [teamMemberships.teamId, teamMemberships.userId],
                set: { role, updatedAt: new Date() },
              });
          },
          async recordAuditEvent(event) {
            await databaseTransaction.insert(organizationAuditEvents).values({
              organizationId: event.organizationId,
              actorUserId: event.actorUserId,
              targetUserId: event.targetUserId ?? null,
              action: event.action,
              details: event.details,
            });
          },
        };

        return operation(transaction);
      }),
  };
}
