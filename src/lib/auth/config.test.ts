import { describe, expect, it } from "vitest";

import {
  getAuthenticationEntryPath,
  getAuthMode,
  isLocalAuthEnabled,
} from "./config";

describe("auth configuration", () => {
  it("defaults to Clerk authentication", () => {
    expect(getAuthMode({ NODE_ENV: "development" })).toBe("clerk");
  });

  it("enables local authentication explicitly in development", () => {
    const environment: NodeJS.ProcessEnv = {
      AUTH_MODE: "local",
      NODE_ENV: "development",
    };

    expect(getAuthMode(environment)).toBe("local");
    expect(isLocalAuthEnabled(environment)).toBe(true);
  });

  it("rejects local authentication in production", () => {
    expect(() =>
      getAuthMode({ AUTH_MODE: "local", NODE_ENV: "production" }),
    ).toThrow("Local authentication cannot run in production");
  });

  it("rejects unknown authentication modes", () => {
    expect(() =>
      getAuthMode({ AUTH_MODE: "unsupported", NODE_ENV: "development" }),
    ).toThrow();
  });

  it("routes local users to the persona selector", () => {
    expect(
      getAuthenticationEntryPath("/app", {
        AUTH_MODE: "local",
        NODE_ENV: "development",
      }),
    ).toBe("/dev/auth?redirect_url=/app");
  });
});
