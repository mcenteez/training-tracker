import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import {
  activeOrganizationCookieName,
  resolveActiveOrganization,
} from "@/modules/organizations/application/active-organization";
import type { UserOrganizationMembershipListItem } from "@/modules/organizations/db/queries";
import {
  getOrCreateUserByClerkId,
  type AuthenticatedUser,
} from "@/modules/users/application/user-service";

function getPrimaryEmailAddress(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | null {
  if (!user) {
    return null;
  }

  const primaryEmailAddress = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
  );

  return (
    primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

function getFullName(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | null {
  if (!user) {
    return null;
  }

  return (
    user.fullName?.trim() ||
    [user.firstName, user.lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .trim() ||
    null
  );
}

export async function loadAuthenticatedUser(options?: {
  signInRedirect?: string;
}): Promise<AuthenticatedUser> {
  const { userId } = await auth();

  if (!userId) {
    redirect(options?.signInRedirect ?? "/sign-in");
  }

  const clerkUser = await currentUser();
  const email = getPrimaryEmailAddress(clerkUser);

  if (!email) {
    redirect("/sign-in");
  }

  return withDatabase((database) =>
    getOrCreateUserByClerkId(database, {
      clerkUserId: userId,
      email,
      fullName: getFullName(clerkUser),
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
