import { expect, test } from "@playwright/test";

import { testIds, usePersona } from "./helpers/persona";

const { basketballTeamId } = testIds;

test.describe("Training Tracker team management", () => {
  test("manager sees only the managed team in the team portfolio", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto("/app/teams");

    await expect(page).toHaveURL(/\/app\/teams$/);
    await expect(page.getByText("Basketball", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Manage team" }),
    ).toHaveAttribute("href", `/app/teams/${basketballTeamId}`);
    await expect(
      page.getByText("No managed teams", { exact: true }),
    ).toHaveCount(0);
  });

  test("manager can update team settings and restore the seeded name", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto(`/app/teams/${basketballTeamId}`);

    await page.getByLabel("Team name").fill("Basketball");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/teams/${basketballTeamId}\\?updated=1$`),
    );
    await expect(page.getByText("Team settings updated.")).toBeVisible();
  });

  test("manager can add, change, and remove an organization member", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto(`/app/teams/${basketballTeamId}`);

    await page.getByLabel("Organization member email").fill("owner@local.test");
    await page.locator("#new-member-role").selectOption("viewer");
    await page.getByRole("button", { name: "Add member" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/teams/${basketballTeamId}\\?memberSaved=1$`),
    );
    await expect(
      page.getByText("owner@local.test", { exact: true }),
    ).toBeVisible();

    const ownerRow = page.locator("li").filter({ hasText: "owner@local.test" });
    await ownerRow
      .getByLabel("Team role for Local Owner")
      .selectOption("athlete");
    await ownerRow.getByRole("button", { name: "Review role" }).click();
    await page.getByRole("button", { name: "Confirm role change" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/teams/${basketballTeamId}\\?memberSaved=1$`),
    );
    await expect(ownerRow.getByLabel("Team role for Local Owner")).toHaveValue(
      "athlete",
    );

    await ownerRow.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Confirm removal" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/teams/${basketballTeamId}\\?memberRemoved=1$`),
    );
    await expect(
      page.getByText("owner@local.test", { exact: true }),
    ).toHaveCount(0);
  });

  test("manager cannot access organization member administration", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto("/app/admin");

    await expect(page).toHaveURL(/\/app\/performance\/teams$/);
    await expect(
      page.getByText("Organization members", { exact: true }),
    ).toHaveCount(0);
  });

  test("manager cannot access an unmanaged team route", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    const response = await page.goto(
      "/app/teams/20000000-0000-4000-8000-000000000099",
    );

    expect(response?.status()).toBe(404);
  });

  test("team role changes never broaden organization scope", async ({
    context,
    page,
  }) => {
    test.setTimeout(60_000);
    await usePersona(context, "owner");

    try {
      await page.goto(`/app/teams/${basketballTeamId}`);
      const memberRow = page
        .locator("li")
        .filter({ hasText: "revoked-manager@local.test" });
      await memberRow
        .getByLabel("Team role for Revoked Team Manager")
        .selectOption("viewer");
      await memberRow.getByRole("button", { name: "Review role" }).click();
      await page.getByRole("button", { name: "Confirm role change" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/app/teams/${basketballTeamId}\\?memberSaved=1$`),
      );

      await page.goto("/app/admin");
      const organizationMember = page
        .locator("li")
        .filter({ hasText: "revoked-manager@local.test" });
      await expect(organizationMember).toContainText("athlete");
    } finally {
      await page.goto(`/app/teams/${basketballTeamId}`);
      const memberRow = page
        .locator("li")
        .filter({ hasText: "revoked-manager@local.test" });
      await memberRow
        .getByLabel("Team role for Revoked Team Manager")
        .selectOption("manager");
      await memberRow.getByRole("button", { name: "Review role" }).click();
      await page.getByRole("button", { name: "Confirm role change" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/app/teams/${basketballTeamId}\\?memberSaved=1$`),
      );
    }
  });
});
