import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedIdentityMock, redirectMock } = vi.hoisted(() => ({
  getAuthenticatedIdentityMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/auth/identity", () => ({
  getAuthenticatedIdentity: getAuthenticatedIdentityMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    getAuthenticatedIdentityMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("redirects anonymous users to sign-in", async () => {
    getAuthenticatedIdentityMock.mockResolvedValue(null);

    await expect(Home()).rejects.toThrow("REDIRECT:/sign-in");

    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });

  it("routes authenticated users through the app landing dispatcher", async () => {
    getAuthenticatedIdentityMock.mockResolvedValue({
      externalId: "clerk_user_1",
      email: "owner@example.com",
      fullName: "Owner",
    });

    await expect(Home()).rejects.toThrow("REDIRECT:/app");

    expect(redirectMock).toHaveBeenCalledWith("/app");
  });
});
