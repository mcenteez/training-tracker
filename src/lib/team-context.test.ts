import { describe, expect, it } from "vitest";

import type { ActiveAppContext } from "@/lib/app-context";
import type { TeamRole } from "@/modules/access-control/roles";

import { resolveAuthorizedTeamContext } from "./team-context";

function appContext(
  organizationRole: ActiveAppContext["membership"]["organizationRole"],
): ActiveAppContext {
  return {
    user: {
      id: "user-1",
      clerkUserId: "clerk-user-1",
      email: "coach@example.com",
      fullName: "Coach Example",
    },
    membership: {
      organizationId: "organization-1",
      organizationName: "Example Organization",
      organizationTimezone: "UTC",
      organizationRole,
    },
    memberships: [],
  };
}

function resolve(input: {
  organizationRole: ActiveAppContext["membership"]["organizationRole"];
  teamRole: TeamRole | null;
  permission: "team.read" | "team.update";
  hasTeam?: boolean;
}) {
  return resolveAuthorizedTeamContext({
    context: appContext(input.organizationRole),
    team: input.hasTeam === false ? null : { id: "team-1", name: "Varsity" },
    teamRole: input.teamRole,
    permission: input.permission,
  });
}

describe("authorized team context", () => {
  it.each(["owner", "manager"] as const)(
    "allows organization %s access without a team membership",
    (organizationRole) => {
      expect(
        resolve({
          organizationRole,
          teamRole: null,
          permission: "team.update",
        }),
      ).not.toBeNull();
    },
  );

  it("allows a Team Manager to manage their team", () => {
    expect(
      resolve({
        organizationRole: "athlete",
        teamRole: "manager",
        permission: "team.update",
      }),
    ).not.toBeNull();
  });

  it.each(["viewer", "athlete"] as const)(
    "keeps Team %s access read-only",
    (teamRole) => {
      expect(
        resolve({
          organizationRole: "athlete",
          teamRole,
          permission: "team.read",
        }),
      ).not.toBeNull();
      expect(
        resolve({
          organizationRole: "athlete",
          teamRole,
          permission: "team.update",
        }),
      ).toBeNull();
    },
  );

  it("rejects an actor without applicable team access", () => {
    expect(
      resolve({
        organizationRole: "athlete",
        teamRole: null,
        permission: "team.read",
      }),
    ).toBeNull();
  });

  it("rejects a missing or foreign-organization team", () => {
    expect(
      resolve({
        organizationRole: "owner",
        teamRole: null,
        permission: "team.read",
        hasTeam: false,
      }),
    ).toBeNull();
  });
});
