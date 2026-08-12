import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { getAuthenticationEntryPath } from "@/lib/auth/config";
import { getAuthenticatedIdentity } from "@/lib/auth/identity";
import {
  activeOrganizationCookieName,
  resolveActiveOrganization,
} from "@/modules/organizations/application/active-organization";
import type { UserOrganizationMembershipListItem } from "@/modules/organizations/db/queries";
import {
  getOrCreateUserByClerkId,
  type AuthenticatedUser,
} from "@/modules/users/application/user-service";

export async function loadAuthenticatedUser(options?: {
  signInRedirect?: string;
}): Promise<AuthenticatedUser> {
  const identity = await getAuthenticatedIdentity();

  if (!identity) {
    redirect(options?.signInRedirect ?? getAuthenticationEntryPath());
  }

  return withDatabase((database) =>
    getOrCreateUserByClerkId(database, {
      clerkUserId: identity.externalId,
      email: identity.email,
      fullName: identity.fullName,
    }),
  );
}

export interface ActiveAppContext {
  user: AuthenticatedUser;
  membership: UserOrganizationMembershipListItem;
  memberships: UserOrganizationMembershipListItem[];
}

export async function loadActiveAppContext(): Promise<ActiveAppContext> {
  const user = await loadAuthenticatedUser();
  const cookieStore = await cookies();
  const preferredOrganizationId =
    cookieStore.get(activeOrganizationCookieName)?.value ?? null;
  const resolution = await withDatabase((database) =>
    resolveActiveOrganization(database, {
      userId: user.id,
      preferredOrganizationId,
    }),
  );

  if (resolution.kind === "onboarding") {
    redirect("/onboarding/organization");
  }

  if (resolution.kind === "organization-chooser") {
    redirect("/app/organizations");
  }

  if (resolution.kind !== "active-organization") {
    redirect("/app/organizations");
  }

  return {
    user,
    membership: resolution.membership,
    memberships: resolution.memberships,
  };
}
