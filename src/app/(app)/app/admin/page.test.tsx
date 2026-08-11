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

import AdminPage from "./page";

function mockAuthenticatedUser() {
  authMock.mockResolvedValue({ userId: "clerk_user_1" });
  currentUserMock.mockResolvedValue({
    primaryEmailAddressId: "primary_1",
    emailAddresses: [
      {
        id: "primary_1",
        emailAddress: "manager@example.com",
      },
    ],
  });
}

describe("app admin page", () => {
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

  it("renders admin interface for manager role", async () => {
    mockAuthenticatedUser();

    withDatabaseMock.mockResolvedValue({
      userContext: {
        id: "user-1",
        clerkUserId: "clerk_user_1",
        email: "manager@example.com",
        fullName: null,
        hasOrganizationMembership: true,
        organizationId: "organization-1",
        organizationRole: "manager",
      },
      organizationName: "North High",
      teams: [],
      organizationMembers: [],
      teamMembers: [],
      invitations: [],
      auditEvents: [],
    });

    const view = await AdminPage({ searchParams: Promise.resolve({}) });
    render(view);

    expect(screen.getByText("Admin Interface")).toBeInTheDocument();
    expect(screen.getByText("Teams")).toBeInTheDocument();
  });

  it("redirects viewer role away from admin interface", async () => {
    mockAuthenticatedUser();

    withDatabaseMock.mockResolvedValue({
      userContext: {
        id: "user-2",
        clerkUserId: "clerk_user_2",
        email: "viewer@example.com",
        fullName: null,
        hasOrganizationMembership: true,
        organizationId: "organization-1",
        organizationRole: "viewer",
      },
      organizationName: "North High",
      teams: [],
      organizationMembers: [],
      teamMembers: [],
      invitations: [],
      auditEvents: [],
    });

    await expect(
      AdminPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/app?error=forbidden_admin");
  });
});
