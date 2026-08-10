import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  OrganizationTransaction,
  OrganizationUnitOfWork,
} from "@/modules/organizations/application/organization-service";
import {
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
        };

        return operation(transaction);
      }),
  };
}
