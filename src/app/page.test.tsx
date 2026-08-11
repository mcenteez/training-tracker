import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("redirects anonymous users to sign-in", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(Home()).rejects.toThrow("REDIRECT:/sign-in");

    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });

  it("routes authenticated users through the app landing dispatcher", async () => {
    authMock.mockResolvedValue({ userId: "clerk_user_1" });

    await expect(Home()).rejects.toThrow("REDIRECT:/app");

    expect(redirectMock).toHaveBeenCalledWith("/app");
  });
});
