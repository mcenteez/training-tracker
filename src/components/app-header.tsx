import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { withDatabase } from "@/db/client";
import { loadAuthenticatedUser } from "@/lib/app-context";
import { resolveLibraryAccess } from "@/modules/access-control/library-access";
import { resolveLandingDestination } from "@/modules/access-control/landing";
import {
  activeOrganizationCookieName,
  resolveActiveOrganization,
} from "@/modules/organizations/application/active-organization";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";

import { AppHeaderClient, type AppNavItem } from "./app-header-client";

function getNavigationItems(input: {
  organizationRole: "owner" | "manager" | "viewer" | "athlete";
  landingHref: string;
  hasTeamPerformance: boolean;
  hasLibraryAccess: boolean;
}): AppNavItem[] {
  const items: AppNavItem[] = [];

  if (input.landingHref === "/app/athlete") {
    items.push({ href: "/app/athlete", label: "My Dashboard" });
  } else if (input.hasTeamPerformance) {
    items.push({ href: "/app/performance/teams", label: "Team Performance" });
  }

  if (input.organizationRole !== "athlete") {
    items.push({
      href: "/app/performance/organization",
      label: "Organization Performance",
    });
  }

  if (input.hasLibraryAccess) {
    items.push({ href: "/app/library", label: "Library" });
  }

  if (
    input.organizationRole === "owner" ||
    input.organizationRole === "manager"
  ) {
    items.push({ href: "/app/admin", label: "Admin" });
  }

  return items;
}

export async function AppHeader() {
  const { userId } = await auth();

  if (!userId) {
    return <AppHeaderClient navigationItems={[]} />;
  }

  const user = await loadAuthenticatedUser();
  const cookieStore = await cookies();
  const activeOrganization = await withDatabase((database) =>
    resolveActiveOrganization(database, {
      userId: user.id,
      preferredOrganizationId:
        cookieStore.get(activeOrganizationCookieName)?.value ?? null,
    }),
  );

  if (activeOrganization.kind !== "active-organization") {
    return (
      <AppHeaderClient
        navigationItems={[]}
        canSwitchOrganization={activeOrganization.memberships.length > 1}
      />
    );
  }

  const teamMemberships = await withDatabase((database) =>
    listTeamMembershipsForUserInOrganization(database, {
      organizationId: activeOrganization.membership.organizationId,
      userId: user.id,
    }),
  );
  const destination = resolveLandingDestination({
    organizationRole: activeOrganization.membership.organizationRole,
    teamMemberships: teamMemberships.map((membership) => ({
      teamId: membership.teamId,
      role: membership.teamRole,
    })),
  });
  const hasTeamPerformance = teamMemberships.some(
    (membership) =>
      membership.teamRole === "manager" || membership.teamRole === "viewer",
  );
  const libraryAccess = resolveLibraryAccess({
    organizationRole: activeOrganization.membership.organizationRole,
    teamRoles: teamMemberships.map((membership) => membership.teamRole),
  });

  return (
    <AppHeaderClient
      navigationItems={getNavigationItems({
        organizationRole: activeOrganization.membership.organizationRole,
        landingHref: destination.href,
        hasTeamPerformance,
        hasLibraryAccess: libraryAccess !== "none",
      })}
      activeOrganizationName={activeOrganization.membership.organizationName}
      canSwitchOrganization={activeOrganization.memberships.length > 1}
    />
  );
}
