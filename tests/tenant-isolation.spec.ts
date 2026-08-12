import { expect, test, type BrowserContext } from "@playwright/test";

type LocalPersona = "manager" | "athlete" | "viewer";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const basketballTeamId = "20000000-0000-4000-8000-000000000001";
const foreignTeamId = "20000000-0000-4000-8000-000000000099";
const foreignOrganizationId = "10000000-0000-4000-8000-000000000099";

async function usePersona(
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

test.describe("Training Tracker tenant isolation", () => {
  test("a local user cannot access a foreign organization team", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto(`/app/performance/teams/${foreignTeamId}`);

    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByText("Foreign Team", { exact: true })).toHaveCount(
      0,
    );
  });

  test("a stale organization selection falls back to the current organization safely", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await context.addCookies([
      {
        name: "training_tracker_active_org",
        value: foreignOrganizationId,
        url: baseURL,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/app");

    await expect(page).toHaveURL(/\/app\/performance\/teams$/);
    await expect(
      page.getByRole("main").getByText("Local Training Organization", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Foreign Training Organization", { exact: true }),
    ).toHaveCount(0);
  });

  test("team manager scope excludes the foreign team from team operations", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto("/app/teams");

    await expect(page.getByText("Basketball", { exact: true })).toBeVisible();
    await expect(page.getByText("Foreign Team", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "Manage team" }),
    ).toHaveAttribute("href", `/app/teams/${basketballTeamId}`);
  });

  test("viewer and athlete cannot reach mutation surfaces", async ({
    context,
    page,
  }) => {
    await usePersona(context, "viewer");
    await page.goto("/app/library/exercises/new");
    await expect(page).toHaveURL(/\/app\/library\/exercises$/);

    await usePersona(context, "athlete");
    await page.goto("/app/assignments/new");
    await expect(page).toHaveURL(/\/app\/athlete$/);
    await page.goto(`/app/teams/${basketballTeamId}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByText("Team settings", { exact: true })).toHaveCount(
      0,
    );
  });
});
