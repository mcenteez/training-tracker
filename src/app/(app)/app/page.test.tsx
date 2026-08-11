import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadActiveAppContextMock, withDatabaseMock, teamMembershipsMock } =
  vi.hoisted(() => ({
    loadActiveAppContextMock: vi.fn(),
    withDatabaseMock: vi.fn(),
    teamMembershipsMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));

vi.mock("@/db/client", () => ({
  withDatabase: withDatabaseMock,
}));

vi.mock("@/modules/teams/db/queries", () => ({
  listTeamMembershipsForUserInOrganization: teamMembershipsMock,
}));

import AppHomePage from "./page";

describe("app landing dispatcher", () => {
  beforeEach(() => {
    loadActiveAppContextMock.mockReset();
    withDatabaseMock.mockReset();
    teamMembershipsMock.mockReset();

    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({}),
    );
  });

  it("lands organization managers on organization performance", async () => {
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: "user-1" },
      membership: {
        organizationId: "organization-1",
        organizationRole: "manager",
      },
      memberships: [],
    });
    teamMembershipsMock.mockResolvedValue([
      { teamId: "team-1", teamName: "Varsity", teamRole: "manager" },
    ]);

    await expect(AppHomePage()).rejects.toThrow(
      "REDIRECT:/app/performance/organization",
    );
  });

  it("lands team managers without higher org access on team performance", async () => {
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: "user-2" },
      membership: {
        organizationId: "organization-1",
        organizationRole: "viewer",
      },
      memberships: [],
    });
    teamMembershipsMock.mockResolvedValue([
      { teamId: "team-1", teamName: "Varsity", teamRole: "manager" },
    ]);

    await expect(AppHomePage()).rejects.toThrow(
      "REDIRECT:/app/performance/teams",
    );
  });

  it("lands team athletes on the athlete dashboard", async () => {
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: "user-3" },
      membership: {
        organizationId: "organization-1",
        organizationRole: "athlete",
      },
      memberships: [],
    });
    teamMembershipsMock.mockResolvedValue([
      { teamId: "team-1", teamName: "Varsity", teamRole: "athlete" },
    ]);

    await expect(AppHomePage()).rejects.toThrow("REDIRECT:/app/athlete");
  });
});
