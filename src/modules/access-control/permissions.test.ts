import { describe, expect, it } from "vitest";

import {
  canManageOrganizationMember,
  hasPermission,
  permissions,
  resolveEffectivePermissions,
} from "./permissions";

describe("organization permissions", () => {
  it("gives the Owner every defined in-app permission", () => {
    for (const permission of permissions) {
      expect(hasPermission({ organizationRole: "owner" }, permission)).toBe(
        true,
      );
    }
  });

  it("allows Managers to manage teams but not ownership", () => {
    const context = { organizationRole: "manager" } as const;

    expect(hasPermission(context, "team.delete")).toBe(true);
    expect(hasPermission(context, "workout.assign.organization")).toBe(true);
    expect(hasPermission(context, "exercise.library.manage")).toBe(true);
    expect(hasPermission(context, "workout.library.manage")).toBe(true);
    expect(hasPermission(context, "results.comment")).toBe(true);
    expect(hasPermission(context, "organization.delete")).toBe(false);
    expect(hasPermission(context, "organization.ownership.transfer")).toBe(
      false,
    );
  });

  it("keeps Viewers read-only", () => {
    const context = { organizationRole: "viewer" } as const;

    expect(hasPermission(context, "team.read")).toBe(true);
    expect(hasPermission(context, "results.read.all")).toBe(true);
    expect(hasPermission(context, "exercise.library.read")).toBe(true);
    expect(hasPermission(context, "workout.library.read")).toBe(true);
    expect(hasPermission(context, "results.comment")).toBe(false);
    expect(hasPermission(context, "workout.library.manage")).toBe(false);
    expect(hasPermission(context, "team.update")).toBe(false);
    expect(hasPermission(context, "results.write.own")).toBe(false);
  });

  it("limits organization Athletes to their own results", () => {
    const context = { organizationRole: "athlete" } as const;

    expect(hasPermission(context, "results.read.own")).toBe(true);
    expect(hasPermission(context, "results.write.own")).toBe(true);
    expect(hasPermission(context, "results.comment")).toBe(false);
    expect(hasPermission(context, "results.read.all")).toBe(false);
    expect(hasPermission(context, "exercise.library.read")).toBe(false);
    expect(hasPermission(context, "workout.library.read")).toBe(false);
  });
});

describe("team permissions", () => {
  it("adds Team Manager access to an organization Viewer", () => {
    const context = {
      organizationRole: "viewer",
      teamRole: "manager",
    } as const;

    expect(hasPermission(context, "team.update")).toBe(true);
    expect(hasPermission(context, "team.members.manage")).toBe(true);
    expect(hasPermission(context, "workout.assign.team")).toBe(true);
    expect(hasPermission(context, "exercise.library.manage")).toBe(true);
    expect(hasPermission(context, "workout.library.manage")).toBe(true);
    expect(hasPermission(context, "results.comment")).toBe(true);
    expect(hasPermission(context, "workout.assign.organization")).toBe(false);
    expect(hasPermission(context, "team.delete")).toBe(false);
  });

  it("keeps Team Viewers read-only", () => {
    const context = {
      organizationRole: "athlete",
      teamRole: "viewer",
    } as const;

    expect(hasPermission(context, "results.read.all")).toBe(true);
    expect(hasPermission(context, "exercise.library.read")).toBe(true);
    expect(hasPermission(context, "workout.library.read")).toBe(true);
    expect(hasPermission(context, "results.comment")).toBe(false);
    expect(hasPermission(context, "workout.library.manage")).toBe(false);
    expect(hasPermission(context, "team.update")).toBe(false);
  });

  it("limits Team Athletes to their own results", () => {
    const context = {
      organizationRole: "athlete",
      teamRole: "athlete",
    } as const;

    expect(hasPermission(context, "results.read.own")).toBe(true);
    expect(hasPermission(context, "results.read.all")).toBe(false);
  });
});

describe("effective permission resolver", () => {
  it("combines organization and team permissions for effective access", () => {
    const resolved = resolveEffectivePermissions({
      organizationRole: "viewer",
      teamRole: "manager",
    });

    expect(resolved.has("organization.read")).toBe(true);
    expect(resolved.has("team.members.manage")).toBe(true);
    expect(resolved.has("workout.assign.organization")).toBe(false);
  });

  it("never removes organization-granted permissions", () => {
    const resolved = resolveEffectivePermissions({
      organizationRole: "manager",
      teamRole: "athlete",
    });

    expect(resolved.has("workout.assign.organization")).toBe(true);
    expect(resolved.has("team.update")).toBe(true);
  });
});

describe("member management", () => {
  it("allows Owners and Managers to manage non-Owners", () => {
    expect(canManageOrganizationMember("owner", "manager")).toBe(true);
    expect(canManageOrganizationMember("manager", "manager")).toBe(true);
    expect(canManageOrganizationMember("manager", "viewer")).toBe(true);
    expect(canManageOrganizationMember("manager", "athlete")).toBe(true);
  });

  it("protects the Owner membership from ordinary member management", () => {
    expect(canManageOrganizationMember("owner", "owner")).toBe(false);
    expect(canManageOrganizationMember("manager", "owner")).toBe(false);
    expect(canManageOrganizationMember("viewer", "manager")).toBe(false);
  });
});
