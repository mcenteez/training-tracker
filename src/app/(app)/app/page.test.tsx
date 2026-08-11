import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { authMock, currentUserMock, withDatabaseMock, redirectMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    currentUserMock: vi.fn(),
    withDatabaseMock: vi.fn(),
    redirectMock: vi.fn(),
  }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/db/client", () => ({
  withDatabase: withDatabaseMock,
}));

import AppHomePage from "./page";

function mockAuthenticatedUser() {
  authMock.mockResolvedValue({ userId: "clerk_user_1" });
  currentUserMock.mockResolvedValue({
    primaryEmailAddressId: "primary_1",
    emailAddresses: [
      {
        id: "primary_1",
        emailAddress: "athlete@example.com",
      },
    ],
  });
}

describe("app dashboard role rendering", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    authMock.mockReset();
    currentUserMock.mockReset();
    withDatabaseMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("renders athlete-focused dashboard for athlete role", async () => {
    mockAuthenticatedUser();
    withDatabaseMock.mockResolvedValue({
      dashboardView: "athlete",
      userContext: {
        id: "user-1",
        clerkUserId: "clerk_user_1",
        email: "athlete@example.com",
        hasOrganizationMembership: true,
        organizationId: "organization-1",
        organizationRole: "athlete",
      },
      athleteTeams: [
        {
          teamId: "team-1",
          teamName: "Varsity",
          teamRole: "athlete",
        },
      ],
      teams: [],
      organizationMembers: [],
      teamMembers: [],
      invitations: [],
      auditEvents: [],
    });

    const view = await AppHomePage({ searchParams: Promise.resolve({}) });
    render(view);

    expect(screen.getByText("Athlete Hub")).toBeInTheDocument();
    expect(screen.getByText("My teams")).toBeInTheDocument();
    expect(screen.queryByText("Organization members")).not.toBeInTheDocument();
  });

  it("renders management dashboard for non-athlete roles", async () => {
    mockAuthenticatedUser();
    withDatabaseMock.mockResolvedValue({
      dashboardView: "admin",
      userContext: {
        id: "user-1",
        clerkUserId: "clerk_user_1",
        email: "manager@example.com",
        hasOrganizationMembership: true,
        organizationId: "organization-1",
        organizationRole: "manager",
      },
      athleteTeams: [],
      teams: [],
      organizationMembers: [],
      teamMembers: [],
      invitations: [],
      auditEvents: [],
    });

    const view = await AppHomePage({ searchParams: Promise.resolve({}) });
    render(view);

    expect(screen.getByText("Control Center")).toBeInTheDocument();
    expect(screen.getByText("Organization members")).toBeInTheDocument();
    expect(screen.queryByText("Athlete Hub")).not.toBeInTheDocument();
  });
});
