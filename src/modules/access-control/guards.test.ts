import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/modules/access-control/errors";

import {
  requireAuthenticatedUser,
  requireOrganizationAccess,
  requireOrganizationRoleAtLeast,
  requireTeamAccess,
  requireTeamRoleAtLeast,
} from "./guards";

describe("access control guards", () => {
  it("requires an authenticated user id", () => {
    expect(() => requireAuthenticatedUser("user-1")).not.toThrow();
    expect(() => requireAuthenticatedUser(null)).toThrow(AuthorizationError);
  });

  it("requires organization access context", () => {
    expect(() =>
      requireOrganizationAccess({ organizationId: "organization-1" }),
    ).not.toThrow();
    expect(() => requireOrganizationAccess({ organizationId: null })).toThrow(
      AuthorizationError,
    );
  });

  it("enforces minimum organization role threshold", () => {
    expect(requireOrganizationRoleAtLeast("owner", "manager")).toBe("owner");
    expect(requireOrganizationRoleAtLeast("manager", "athlete")).toBe(
      "manager",
    );
    expect(() => requireOrganizationRoleAtLeast("viewer", "manager")).toThrow(
      AuthorizationError,
    );
  });

  it("enforces minimum team role threshold", () => {
    expect(requireTeamRoleAtLeast("manager", "viewer")).toBe("manager");
    expect(() => requireTeamRoleAtLeast("athlete", "manager")).toThrow(
      AuthorizationError,
    );
    expect(() => requireTeamRoleAtLeast(null, "athlete")).toThrow(
      AuthorizationError,
    );
  });

  it("enforces permission-aware team access", () => {
    expect(() =>
      requireTeamAccess(
        { organizationRole: "manager", teamRole: null },
        "team.members.manage",
      ),
    ).not.toThrow();

    expect(() =>
      requireTeamAccess(
        { organizationRole: "athlete", teamRole: "athlete" },
        "team.members.manage",
      ),
    ).toThrow(AuthorizationError);
  });
});
