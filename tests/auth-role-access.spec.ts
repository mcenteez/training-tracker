import { expect, test } from "@playwright/test";

import { usePersona } from "./helpers/persona";

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

  test("team manager can access team operations and manage their team", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto("/app/teams");

    await expect(page).toHaveURL(/\/app\/teams$/);
    await expect(
      page.getByRole("main").getByText("Team Management", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage team" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View performance" }),
    ).toBeVisible();
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

    await page.goto("/app/teams");
    await expect(page).toHaveURL(/\/app\/athlete$/);
  });

  test("viewer cannot access team operations", async ({ context, page }) => {
    await usePersona(context, "viewer");
    await page.goto("/app/teams");

    await expect(page).toHaveURL(/\/app\/performance\/organization$/);
    await expect(
      page.getByText("Team Management", { exact: true }),
    ).toHaveCount(0);
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
      page.getByRole("region", { name: "Organization compliance summary" }),
    ).toBeVisible();
    await expect(
      page.getByText("Completion rate", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Programming coverage", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "90 days" }).click();
    await expect(page).toHaveURL(/\?window=90$/);
    await expect(
      page.getByRole("link", { name: "Basketball", exact: true }),
    ).toHaveAttribute("href", /\/app\/performance\/teams\/.+\?window=90$/);
    await expect(
      page.getByRole("link", { name: "Team Performance" }).first(),
    ).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByText("Team compliance", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
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
