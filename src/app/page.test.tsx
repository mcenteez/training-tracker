import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, currentUserMock, redirectMock, withDatabaseMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    currentUserMock: vi.fn(),
    redirectMock: vi.fn(),
    withDatabaseMock: vi.fn(),
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

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    authMock.mockReset();
    currentUserMock.mockReset();
    redirectMock.mockReset();
    withDatabaseMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("redirects anonymous users to sign-in", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(Home()).rejects.toThrow("REDIRECT:/sign-in");

    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });

  it("redirects authenticated users with no organization to onboarding", async () => {
    authMock.mockResolvedValue({ userId: "clerk_user_1" });
    currentUserMock.mockResolvedValue({
      primaryEmailAddressId: "primary_1",
      emailAddresses: [
        {
          id: "primary_1",
          emailAddress: "owner@example.com",
        },
      ],
    });
    withDatabaseMock.mockResolvedValue({ hasOrganizationMembership: false });

    await expect(Home()).rejects.toThrow("REDIRECT:/onboarding/organization");

    expect(redirectMock).toHaveBeenCalledWith("/onboarding/organization");
  });

  it("redirects authenticated users with an organization to app home", async () => {
    authMock.mockResolvedValue({ userId: "clerk_user_1" });
    currentUserMock.mockResolvedValue({
      primaryEmailAddressId: "primary_1",
      emailAddresses: [
        {
          id: "primary_1",
          emailAddress: "owner@example.com",
        },
      ],
    });
    withDatabaseMock.mockResolvedValue({ hasOrganizationMembership: true });

    await expect(Home()).rejects.toThrow("REDIRECT:/app");

    expect(redirectMock).toHaveBeenCalledWith("/app");
  });
});
