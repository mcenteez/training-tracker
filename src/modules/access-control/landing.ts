import type { OrganizationRole, TeamRole } from "./roles";

export const landingRoutes = {
  organizationPerformance: "/app/performance/organization",
  teamPerformance: "/app/performance/teams",
  athlete: "/app/athlete",
  organizationChooser: "/app/organizations",
  onboarding: "/onboarding/organization",
} as const;

export type LandingDestination =
  | {
      kind: "organization-performance";
      href: typeof landingRoutes.organizationPerformance;
    }
  | {
      kind: "team-performance";
      href: typeof landingRoutes.teamPerformance;
      teamRole: "manager" | "viewer";
    }
  | { kind: "athlete"; href: typeof landingRoutes.athlete }
  | {
      kind: "organization-chooser";
      href: typeof landingRoutes.organizationChooser;
    }
  | { kind: "onboarding"; href: typeof landingRoutes.onboarding };

export interface LandingTeamMembership {
  teamId: string;
  role: TeamRole;
}

export function resolveTeamPerformancePortfolio<
  Membership extends LandingTeamMembership,
>(
  teamMemberships: readonly Membership[],
): {
  teamRole: "manager" | "viewer" | null;
  memberships: Membership[];
} {
  const teamRole = teamMemberships.some(
    (membership) => membership.role === "manager",
  )
    ? "manager"
    : teamMemberships.some((membership) => membership.role === "viewer")
      ? "viewer"
      : null;

  return {
    teamRole,
    memberships: teamRole
      ? teamMemberships.filter((membership) => membership.role === teamRole)
      : [],
  };
}

export function resolveLandingDestination(input: {
  organizationRole: OrganizationRole;
  teamMemberships: readonly LandingTeamMembership[];
}): LandingDestination {
  if (
    input.organizationRole === "owner" ||
    input.organizationRole === "manager"
  ) {
    return {
      kind: "organization-performance",
      href: landingRoutes.organizationPerformance,
    };
  }

  const portfolio = resolveTeamPerformancePortfolio(input.teamMemberships);

  if (portfolio.teamRole === "manager") {
    return {
      kind: "team-performance",
      href: landingRoutes.teamPerformance,
      teamRole: "manager",
    };
  }

  if (input.organizationRole === "viewer") {
    return {
      kind: "organization-performance",
      href: landingRoutes.organizationPerformance,
    };
  }

  if (portfolio.teamRole === "viewer") {
    return {
      kind: "team-performance",
      href: landingRoutes.teamPerformance,
      teamRole: "viewer",
    };
  }

  return { kind: "athlete", href: landingRoutes.athlete };
}

export function resolveOrganizationSelection(input: {
  organizationIds: readonly string[];
  preferredOrganizationId: string | null;
}):
  | { kind: "onboarding" }
  | { kind: "organization-chooser" }
  | { kind: "active-organization"; organizationId: string } {
  if (input.organizationIds.length === 0) {
    return { kind: "onboarding" };
  }

  if (input.organizationIds.length === 1) {
    return {
      kind: "active-organization",
      organizationId: input.organizationIds[0]!,
    };
  }

  if (
    input.preferredOrganizationId &&
    input.organizationIds.includes(input.preferredOrganizationId)
  ) {
    return {
      kind: "active-organization",
      organizationId: input.preferredOrganizationId,
    };
  }

  return { kind: "organization-chooser" };
}
