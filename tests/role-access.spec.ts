import { expect, test, type BrowserContext } from "@playwright/test";

type LocalPersona = "owner" | "manager" | "athlete" | "viewer";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

async function usePersona(
  context: BrowserContext,
  persona: LocalPersona | "invalid",
) {
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

test.describe("Training Tracker local personas", () => {
  test("manual selector signs in as the organization owner", async ({
    page,
  }) => {
    await page.goto("/dev/auth");
    await page.getByRole("button", { name: /organization owner/i }).click();

    await expect(page).toHaveURL(/\/app\/performance\/organization$/);
    await expect(
      page.getByText("Local Training Organization", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Switch persona" }),
    ).toBeVisible();
  });

  test("owner receives organization-wide navigation", async ({
    context,
    page,
  }) => {
    await usePersona(context, "owner");
    await page.goto("/app");

    await expect(page).toHaveURL(/\/app\/performance\/organization$/);
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(page.getByText("Basketball", { exact: true })).toBeVisible();
  });

  test("team manager receives Basketball team access", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto("/app");

    await expect(page).toHaveURL(/\/app\/performance\/teams$/);
    await expect(page.getByText("Basketball", { exact: true })).toBeVisible();
    await expect(page.getByText("Team role: manager")).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });

  test("athlete sees the athlete dashboard and cannot open Admin", async ({
    context,
    page,
  }) => {
    await usePersona(context, "athlete");
    await page.goto("/app");

    await expect(page).toHaveURL(/\/app\/athlete$/);
    await expect(
      page.getByText("Your training dashboard", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Basketball", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

    await page.goto("/app/admin");
    await expect(page).toHaveURL(/\/app\/athlete$/);
  });

  test("viewer has read-only organization access", async ({
    context,
    page,
  }) => {
    await usePersona(context, "viewer");
    await page.goto("/app");

    await expect(page).toHaveURL(/\/app\/performance\/organization$/);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Team Performance" }).first(),
    ).toBeVisible();
  });

  test("invalid personas remain unauthenticated", async ({ context, page }) => {
    await usePersona(context, "invalid");
    await page.goto("/app");

    await expect(page).toHaveURL(/\/dev\/auth$/);
    await expect(
      page.getByText("Choose a local persona", { exact: true }),
    ).toBeVisible();
  });

  test("clearing a persona ends the local session", async ({ page }) => {
    await page.goto("/dev/auth");
    await page.getByRole("button", { name: /organization owner/i }).click();
    await page.getByRole("link", { name: "Switch persona" }).click();
    await page.getByRole("button", { name: "Clear selected persona" }).click();
    await page.goto("/app");

    await expect(page).toHaveURL(/\/dev\/auth$/);
  });
});
