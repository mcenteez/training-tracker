import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { loadActiveAppContextMock, withDatabaseMock, redirectMock } = vi.hoisted(
  () => ({
    loadActiveAppContextMock: vi.fn(),
    withDatabaseMock: vi.fn(),
    redirectMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/db/client", () => ({
  withDatabase: withDatabaseMock,
}));

vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));

import AdminPage from "./page";

describe("app admin page", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    loadActiveAppContextMock.mockReset();
    withDatabaseMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("renders admin interface for manager role", async () => {
    loadActiveAppContextMock.mockResolvedValue({
      user: {
        id: "user-1",
        clerkUserId: "clerk_user_1",
        email: "manager@example.com",
        fullName: null,
      },
      membership: {
        organizationId: "organization-1",
        organizationName: "North High",
        organizationRole: "manager",
      },
      memberships: [],
    });

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
    loadActiveAppContextMock.mockResolvedValue({
      user: {
        id: "user-2",
        clerkUserId: "clerk_user_2",
        email: "viewer@example.com",
        fullName: null,
      },
      membership: {
        organizationId: "organization-1",
        organizationName: "North High",
        organizationRole: "viewer",
      },
      memberships: [],
    });

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
