import { expect, test } from "@playwright/test";

import { baseURL, testIds, usePersona } from "./helpers/persona";

const { basketballTeamId, foreignTeamId, foreignOrganizationId } = testIds;

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

  test("removed team manager loses sensitive access on the next request", async ({
    context,
    page,
  }) => {
    await usePersona(context, "revokedManager");
    await page.goto(`/app/performance/teams/${basketballTeamId}`);
    await expect(page.getByText("Basketball", { exact: true })).toBeVisible();

    try {
      await usePersona(context, "owner");
      await page.goto(`/app/teams/${basketballTeamId}`);
      const revokedManagerRow = page
        .locator("li")
        .filter({ hasText: "revoked-manager@local.test" });
      await revokedManagerRow.getByRole("button", { name: "Remove" }).click();
      await page.getByRole("button", { name: "Confirm removal" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/app/teams/${basketballTeamId}\\?memberRemoved=1$`),
      );

      await usePersona(context, "revokedManager");
      await page.goto(`/app/performance/teams/${basketballTeamId}`);
      await expect(
        page.getByText("This page could not be found."),
      ).toBeVisible();
    } finally {
      await usePersona(context, "owner");
      await page.goto(`/app/teams/${basketballTeamId}`);
      await page
        .getByLabel("Organization member email")
        .fill("revoked-manager@local.test");
      await page.locator("#new-member-role").selectOption("manager");
      await page.getByRole("button", { name: "Add member" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/app/teams/${basketballTeamId}\\?memberSaved=1$`),
      );
    }
  });

  test("server rejects a tampered foreign assignment target", async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const exerciseName = `Playwright Tamper Exercise ${suffix}`;
    const workoutName = `Playwright Tamper Workout ${suffix}`;

    await usePersona(context, "manager");
    await page.goto("/app/library/exercises/new");
    await page.getByLabel("Exercise name").fill(exerciseName);
    await page.getByLabel("Category").selectOption("strength");
    await page.getByRole("button", { name: "Create exercise" }).click();
    await expect(page).toHaveURL(/\/app\/library\/exercises\?created=1$/);

    await page.goto("/app/library/workouts/new");
    await page.getByLabel("Workout name").fill(workoutName);
    await page.getByRole("button", { name: "Add block" }).click();
    const block = page.getByRole("region", { name: "Block 1" });
    await block.getByRole("button", { name: "Add exercise" }).click();
    await block.getByLabel("Exercise").selectOption({ label: exerciseName });
    await block.getByLabel("Reps").fill("5");
    await page.getByRole("button", { name: "Activate workout" }).click();
    await expect(page).toHaveURL(/\/app\/library\/workouts\/[^/]+\?saved=1$/);

    await page.goto("/app/assignments/new");
    await page
      .locator('label:has(input[aria-label="Assign a workout"])')
      .click();
    await page
      .getByLabel("Choose a workout")
      .selectOption({ label: workoutName });
    await page
      .getByLabel("Scheduled date")
      .fill(new Date().toISOString().slice(0, 10));
    await page.locator("form").evaluate((form, targetId) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "teamIds";
      input.value = targetId as string;
      form.appendChild(input);
    }, foreignTeamId);
    await page.getByRole("button", { name: "Save Draft and Review" }).click();

    await expect(page).toHaveURL(
      /\/app\/assignments\?error=assignment_action_failed$/,
    );
    await expect(
      page.getByText("No assignments yet", { exact: true }),
    ).toHaveCount(0);
  });
});
