import { afterEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, getClerkIdentityMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getClerkIdentityMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("./clerk-identity", () => ({
  getClerkIdentity: getClerkIdentityMock,
}));

import { getAuthenticatedIdentity } from "./identity";

const originalAuthMode = process.env.AUTH_MODE;

afterEach(() => {
  vi.clearAllMocks();

  if (originalAuthMode === undefined) {
    delete process.env.AUTH_MODE;
  } else {
    process.env.AUTH_MODE = originalAuthMode;
  }
});

describe("getAuthenticatedIdentity", () => {
  it("uses Clerk when local authentication is disabled", async () => {
    const identity = {
      externalId: "clerk:user",
      email: "user@example.com",
      fullName: "Example User",
    };
    getClerkIdentityMock.mockResolvedValue(identity);

    await expect(getAuthenticatedIdentity()).resolves.toEqual(identity);
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it("resolves an allowlisted local persona from the cookie", async () => {
    process.env.AUTH_MODE = "local";
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "athlete" }),
    });

    await expect(getAuthenticatedIdentity()).resolves.toEqual({
      externalId: "local:athlete",
      email: "athlete@local.test",
      fullName: "Local Athlete",
    });
    expect(getClerkIdentityMock).not.toHaveBeenCalled();
  });

  it("resolves the second local athlete persona from the cookie", async () => {
    process.env.AUTH_MODE = "local";
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "athleteTwo" }),
    });

    await expect(getAuthenticatedIdentity()).resolves.toEqual({
      externalId: "local:athlete-two",
      email: "athlete-two@local.test",
      fullName: "Local Athlete Two",
    });
  });

  it("does not authenticate an unknown local persona", async () => {
    process.env.AUTH_MODE = "local";
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "arbitrary-user" }),
    });

    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
  });

  it("does not authenticate when the local persona cookie is missing", async () => {
    process.env.AUTH_MODE = "local";
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });

    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
  });
});
