import { describe, expect, it } from "vitest";

import {
  landingRoutes,
  resolveLandingDestination,
  resolveOrganizationSelection,
  resolveTeamPerformancePortfolio,
} from "./landing";

describe("landing destination resolver", () => {
  it.each([
    [
      "owner",
      [],
      "organization-performance",
      landingRoutes.organizationPerformance,
    ],
    [
      "manager",
      [{ teamId: "team-1", role: "manager" }],
      "organization-performance",
      landingRoutes.organizationPerformance,
    ],
    [
      "viewer",
      [{ teamId: "team-1", role: "manager" }],
      "team-performance",
      landingRoutes.teamPerformance,
    ],
    [
      "viewer",
      [{ teamId: "team-1", role: "viewer" }],
      "organization-performance",
      landingRoutes.organizationPerformance,
    ],
    [
      "athlete",
      [{ teamId: "team-1", role: "manager" }],
      "team-performance",
      landingRoutes.teamPerformance,
    ],
    [
      "athlete",
      [{ teamId: "team-1", role: "viewer" }],
      "team-performance",
      landingRoutes.teamPerformance,
    ],
    [
      "athlete",
      [{ teamId: "team-1", role: "athlete" }],
      "athlete",
      landingRoutes.athlete,
    ],
    ["athlete", [], "athlete", landingRoutes.athlete],
  ] as const)(
    "resolves %s with scoped team memberships",
    (organizationRole, teamMemberships, expectedKind, expectedHref) => {
      expect(
        resolveLandingDestination({ organizationRole, teamMemberships }),
      ).toMatchObject({ kind: expectedKind, href: expectedHref });
    },
  );

  it("uses the highest applicable team role across mixed memberships", () => {
    expect(
      resolveLandingDestination({
        organizationRole: "athlete",
        teamMemberships: [
          { teamId: "team-athlete", role: "athlete" },
          { teamId: "team-viewer", role: "viewer" },
          { teamId: "team-manager", role: "manager" },
        ],
      }),
    ).toEqual({
      kind: "team-performance",
      href: landingRoutes.teamPerformance,
      teamRole: "manager",
    });
  });
});

describe("organization selection resolver", () => {
  it("sends users without memberships to onboarding", () => {
    expect(
      resolveOrganizationSelection({
        organizationIds: [],
        preferredOrganizationId: null,
      }),
    ).toEqual({ kind: "onboarding" });
  });

  it("selects a single organization automatically", () => {
    expect(
      resolveOrganizationSelection({
        organizationIds: ["organization-1"],
        preferredOrganizationId: null,
      }),
    ).toEqual({
      kind: "active-organization",
      organizationId: "organization-1",
    });
  });

  it("uses a valid preferred organization", () => {
    expect(
      resolveOrganizationSelection({
        organizationIds: ["organization-1", "organization-2"],
        preferredOrganizationId: "organization-2",
      }),
    ).toEqual({
      kind: "active-organization",
      organizationId: "organization-2",
    });
  });

  it("requires a choice when the preference is missing or stale", () => {
    expect(
      resolveOrganizationSelection({
        organizationIds: ["organization-1", "organization-2"],
        preferredOrganizationId: "foreign-organization",
      }),
    ).toEqual({ kind: "organization-chooser" });
  });
});

describe("team performance portfolio resolver", () => {
  it("includes only managed teams when any manager membership exists", () => {
    expect(
      resolveTeamPerformancePortfolio([
        { teamId: "managed", role: "manager" },
        { teamId: "viewed", role: "viewer" },
        { teamId: "athlete", role: "athlete" },
      ]),
    ).toEqual({
      teamRole: "manager",
      memberships: [{ teamId: "managed", role: "manager" }],
    });
  });

  it("includes only viewed teams when no manager membership exists", () => {
    expect(
      resolveTeamPerformancePortfolio([
        { teamId: "viewed", role: "viewer" },
        { teamId: "athlete", role: "athlete" },
      ]),
    ).toEqual({
      teamRole: "viewer",
      memberships: [{ teamId: "viewed", role: "viewer" }],
    });
  });

  it("returns no portfolio for athlete-only memberships", () => {
    expect(
      resolveTeamPerformancePortfolio([{ teamId: "athlete", role: "athlete" }]),
    ).toEqual({ teamRole: null, memberships: [] });
  });
});
