import "server-only";

import { z } from "zod";

const authModeSchema = z.enum(["clerk", "local"]).default("clerk");

export type AuthMode = z.infer<typeof authModeSchema>;

export function getAuthMode(
  environment: NodeJS.ProcessEnv = process.env,
): AuthMode {
  const mode = authModeSchema.parse(environment.AUTH_MODE);

  if (mode === "local" && environment.NODE_ENV === "production") {
    throw new Error("Local authentication cannot run in production");
  }

  return mode;
}

export function isLocalAuthEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return getAuthMode(environment) === "local";
}

export function getAuthenticationEntryPath(
  redirectPath?: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const entryPath = isLocalAuthEnabled(environment) ? "/dev/auth" : "/sign-in";

  return redirectPath ? `${entryPath}?redirect_url=${redirectPath}` : entryPath;
}
