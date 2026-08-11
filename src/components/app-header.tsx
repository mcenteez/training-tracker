import { auth, currentUser } from "@clerk/nextjs/server";

import { withDatabase } from "@/db/client";
import { getAuthenticatedUserContext } from "@/modules/users/application/user-service";

import { AppHeaderClient, type AppNavItem } from "./app-header-client";

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

  const candidate = user.fullName?.trim();
  if (candidate) {
    return candidate;
  }

  const fallback = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();

  return fallback || null;
}

function getNavigationItems(role: string | null): AppNavItem[] {
  if (role === "athlete") {
    return [{ href: "/app", label: "My Dashboard" }];
  }

  if (role === "owner" || role === "manager") {
    return [
      { href: "/app", label: "Performance" },
      { href: "/app/admin", label: "Admin" },
    ];
  }

  return [{ href: "/app", label: "Performance" }];
}

export async function AppHeader() {
  const { userId } = await auth();

  if (!userId) {
    return <AppHeaderClient navigationItems={getNavigationItems(null)} />;
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);
  const fullName = getFullName(user);

  if (!email) {
    return <AppHeaderClient navigationItems={getNavigationItems(null)} />;
  }

  const context = await withDatabase((database) =>
    getAuthenticatedUserContext(database, {
      clerkUserId: userId,
      email,
      fullName,
    }),
  );

  return (
    <AppHeaderClient
      navigationItems={getNavigationItems(context.organizationRole)}
    />
  );
}
