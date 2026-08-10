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
}

export interface AuthenticatedUserContext extends AuthenticatedUser {
  hasOrganizationMembership: boolean;
  organizationId: string | null;
  organizationRole: OrganizationRole | null;
}

export async function getOrCreateUserByClerkId(
  database: Database,
  input: { clerkUserId: string; email: string },
): Promise<AuthenticatedUser> {
  return database.transaction(async (transaction) => {
    const [existingUser] = await transaction
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
      })
      .from(users)
      .where(eq(users.clerkUserId, input.clerkUserId))
      .limit(1);

    if (existingUser) {
      return existingUser;
    }

    const [createdUser] = await transaction
      .insert(users)
      .values({ clerkUserId: input.clerkUserId, email: input.email })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
      });

    if (createdUser) {
      return createdUser;
    }

    const [userAfterConflict] = await transaction
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
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
  input: { clerkUserId: string; email: string },
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
