import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listTeamMembershipsMock,
  listTeamsByIdsMock,
  listTeamsByOrganizationMock,
  loadActiveAppContextMock,
  redirectMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  listTeamMembershipsMock: vi.fn(),
  listTeamsByIdsMock: vi.fn(),
  listTeamsByOrganizationMock: vi.fn(),
  loadActiveAppContextMock: vi.fn(),
  redirectMock: vi.fn(),
  withDatabaseMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));
vi.mock("@/modules/teams/db/queries", () => ({
  listTeamMembershipsForUserInOrganization: listTeamMembershipsMock,
  listTeamsByIdsInOrganization: listTeamsByIdsMock,
  listTeamsByOrganizationId: listTeamsByOrganizationMock,
}));

import TeamOperationsPage from "./page";

afterEach(cleanup);

describe("team operations portfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({ id: "database" }),
    );
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: "user-1" },
      membership: {
        organizationId: "organization-1",
        organizationName: "Example Organization",
        organizationRole: "athlete",
      },
    });
    listTeamMembershipsMock.mockResolvedValue([
      { teamId: "team-1", teamName: "Varsity", teamRole: "manager" },
      { teamId: "team-2", teamName: "Junior", teamRole: "viewer" },
    ]);
    listTeamsByIdsMock.mockResolvedValue([{ id: "team-1", name: "Varsity" }]);
    listTeamsByOrganizationMock.mockResolvedValue([
      { id: "team-1", name: "Varsity" },
      { id: "team-2", name: "Junior" },
    ]);
  });

  it("loads only managed teams for a Team Manager", async () => {
    render(await TeamOperationsPage({ searchParams: Promise.resolve({}) }));

    expect(listTeamsByIdsMock).toHaveBeenCalledWith(
      { id: "database" },
      { organizationId: "organization-1", teamIds: ["team-1"] },
    );
    expect(listTeamsByOrganizationMock).not.toHaveBeenCalled();
    expect(screen.getByText("Varsity")).toBeVisible();
    expect(screen.queryByText("Junior")).toBeNull();
  });

  it("loads all organization teams for an Organization Manager", async () => {
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: "user-1" },
      membership: {
        organizationId: "organization-1",
        organizationName: "Example Organization",
        organizationRole: "manager",
      },
    });

    render(await TeamOperationsPage({ searchParams: Promise.resolve({}) }));

    expect(listTeamsByOrganizationMock).toHaveBeenCalledWith(
      { id: "database" },
      "organization-1",
    );
    expect(listTeamsByIdsMock).not.toHaveBeenCalled();
    expect(screen.getByText("Varsity")).toBeVisible();
    expect(screen.getByText("Junior")).toBeVisible();
  });

  it("redirects users without team management access", async () => {
    listTeamMembershipsMock.mockResolvedValue([
      { teamId: "team-2", teamName: "Junior", teamRole: "viewer" },
    ]);

    await expect(
      TeamOperationsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/app");

    expect(listTeamsByIdsMock).not.toHaveBeenCalled();
    expect(listTeamsByOrganizationMock).not.toHaveBeenCalled();
  });
});
