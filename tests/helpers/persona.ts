import type { BrowserContext } from "@playwright/test";

export type LocalPersona =
  | "owner"
  | "manager"
  | "revokedManager"
  | "athlete"
  | "athleteTwo"
  | "viewer"
  | "invalid";

export const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export const testIds = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  basketballTeamId: "20000000-0000-4000-8000-000000000001",
  foreignOrganizationId: "10000000-0000-4000-8000-000000000099",
  foreignTeamId: "20000000-0000-4000-8000-000000000099",
} as const;

export async function usePersona(
  context: BrowserContext,
  persona: LocalPersona,
): Promise<void> {
  await context.addCookies([
    {
      name: "training_tracker_local_persona",
      value: persona,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
