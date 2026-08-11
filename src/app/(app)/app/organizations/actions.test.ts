import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  cookieSetMock,
  findMembershipMock,
  loadAuthenticatedUserMock,
  redirectMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  cookieSetMock: vi.fn(),
  findMembershipMock: vi.fn(),
  loadAuthenticatedUserMock: vi.fn(),
  redirectMock: vi.fn(),
  withDatabaseMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/app-context", () => ({
  loadAuthenticatedUser: loadAuthenticatedUserMock,
}));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/modules/organizations/db/queries", () => ({
  findOrganizationMembershipForUser: findMembershipMock,
}));

import { activeOrganizationCookieName } from "@/modules/organizations/application/active-organization";

import { selectOrganizationAction } from "./actions";

describe("select organization action", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    cookieSetMock.mockReset();
    findMembershipMock.mockReset();
    loadAuthenticatedUserMock.mockReset();
    redirectMock.mockReset();
    withDatabaseMock.mockReset();

    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    cookiesMock.mockResolvedValue({ set: cookieSetMock });
    loadAuthenticatedUserMock.mockResolvedValue({ id: "user-1" });
    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({}),
    );
  });

  it("sets the active organization cookie for a validated membership", async () => {
    findMembershipMock.mockResolvedValue({
      organizationId: "10000000-0000-4000-8000-000000000001",
      organizationName: "North High",
      organizationRole: "manager",
    });
    const formData = new FormData();
    formData.set("organizationId", "10000000-0000-4000-8000-000000000001");

    await expect(selectOrganizationAction(formData)).rejects.toThrow(
      "REDIRECT:/app",
    );

    expect(cookieSetMock).toHaveBeenCalledWith(
      activeOrganizationCookieName,
      "10000000-0000-4000-8000-000000000001",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("rejects an organization outside the authenticated user's memberships", async () => {
    findMembershipMock.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("organizationId", "20000000-0000-4000-8000-000000000002");

    await expect(selectOrganizationAction(formData)).rejects.toThrow(
      "REDIRECT:/app/organizations?error=forbidden_organization",
    );

    expect(cookieSetMock).not.toHaveBeenCalled();
  });
});
