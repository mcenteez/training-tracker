import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  TeamTransaction,
  TeamUnitOfWork,
} from "@/modules/teams/application/team-service";
import {
  organizationAuditEvents,
  organizationMemberships,
} from "@/modules/organizations/db/schema";
import { teamMemberships, teams } from "@/modules/teams/db/schema";

export function createTeamUnitOfWork(database: Database): TeamUnitOfWork {
  return {
    transaction: (operation) =>
      database.transaction(async (databaseTransaction) => {
        const transaction: TeamTransaction = {
          async createTeam(organizationId, name) {
            const [team] = await databaseTransaction
              .insert(teams)
              .values({ organizationId, name })
              .returning({
                id: teams.id,
                organizationId: teams.organizationId,
                name: teams.name,
              });

            if (!team) {
              throw new Error("Failed to create team");
            }

            return team;
          },
          async updateTeam(organizationId, teamId, name) {
            const [team] = await databaseTransaction
              .update(teams)
              .set({ name, updatedAt: new Date() })
              .where(
                and(
                  eq(teams.organizationId, organizationId),
                  eq(teams.id, teamId),
                ),
              )
              .returning({
                id: teams.id,
                organizationId: teams.organizationId,
                name: teams.name,
              });

            return team ?? null;
          },
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
          async deleteTeamMembership(organizationId, teamId, userId) {
            await databaseTransaction
              .delete(teamMemberships)
              .where(
                and(
                  eq(teamMemberships.organizationId, organizationId),
                  eq(teamMemberships.teamId, teamId),
                  eq(teamMemberships.userId, userId),
                ),
              );
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
