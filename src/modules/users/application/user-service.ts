import "server-only";

import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { OrganizationRole } from "@/modules/access-control/roles";
import { organizationMemberships } from "@/modules/organizations/db/schema";
import { users } from "@/modules/users/db/schema";

export interface AuthenticatedUser {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
}

export interface AuthenticatedUserContext extends AuthenticatedUser {
  hasOrganizationMembership: boolean;
  organizationId: string | null;
  organizationRole: OrganizationRole | null;
}

export async function getOrCreateUserByClerkId(
  database: Database,
  input: { clerkUserId: string; email: string; fullName?: string | null },
): Promise<AuthenticatedUser> {
  const normalizedFullName = input.fullName?.trim() || null;

  return database.transaction(async (transaction) => {
    const [existingUser] = await transaction
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
        fullName: users.fullName,
      })
      .from(users)
      .where(eq(users.clerkUserId, input.clerkUserId))
      .limit(1);

    if (existingUser) {
      if (
        existingUser.email !== input.email ||
        existingUser.fullName !== normalizedFullName
      ) {
        const [updatedUser] = await transaction
          .update(users)
          .set({ email: input.email, fullName: normalizedFullName })
          .where(eq(users.id, existingUser.id))
          .returning({
            id: users.id,
            clerkUserId: users.clerkUserId,
            email: users.email,
            fullName: users.fullName,
          });

        if (updatedUser) {
          return updatedUser;
        }
      }

      return existingUser;
    }

    const [createdUser] = await transaction
      .insert(users)
      .values({
        clerkUserId: input.clerkUserId,
        email: input.email,
        fullName: normalizedFullName,
      })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
        fullName: users.fullName,
      });

    if (createdUser) {
      return createdUser;
    }

    const [userAfterConflict] = await transaction
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
        fullName: users.fullName,
      })
      .from(users)
      .where(eq(users.clerkUserId, input.clerkUserId))
      .limit(1);

    if (!userAfterConflict) {
      throw new Error("Failed to create or load user");
    }

    return userAfterConflict;
  });
}

export async function getAuthenticatedUserContext(
  database: Database,
  input: { clerkUserId: string; email: string; fullName?: string | null },
): Promise<AuthenticatedUserContext> {
  const user = await getOrCreateUserByClerkId(database, input);

  const [membership] = await database
    .select({
      organizationId: organizationMemberships.organizationId,
      organizationRole: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, user.id))
    .limit(1);

  return {
    ...user,
    hasOrganizationMembership: membership !== undefined,
    organizationId: membership?.organizationId ?? null,
    organizationRole: membership?.organizationRole ?? null,
  };
}
