import { expect, test } from "@playwright/test";

import { usePersona } from "./helpers/persona";

function bundle(suffix: string) {
  return {
    formatVersion: 1,
    exercises: [
      {
        name: `Playwright Import Squat ${suffix}`,
        category: "strength",
        instructions: "Brace and drive through midfoot.",
      },
    ],
    workouts: [
      {
        name: `Playwright Import Lower Body ${suffix}`,
        blocks: [
          {
            type: "straight",
            rounds: 1,
            items: [{ exercise: `Playwright Import Squat ${suffix}`, reps: 5 }],
          },
        ],
      },
    ],
    plans: [
      {
        name: `Playwright Import Base ${suffix}`,
        scheduleSlots: [
          {
            scheduleType: "fixed_day",
            workout: `Playwright Import Lower Body ${suffix}`,
            dayOfWeek: "monday",
          },
        ],
      },
    ],
  };
}

test.describe("Training Tracker library import", () => {
  test("manager can preview and commit a JSON bundle", async ({
    context,
    page,
  }, testInfo) => {
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const payload = bundle(suffix);

    await usePersona(context, "manager");
    await page.goto("/app/library/import");

    await page.getByLabel("Paste JSON").fill(JSON.stringify(payload));
    await page.getByRole("button", { name: "Check this import" }).click();

    const results = page.locator('section[aria-label="Import results"]');
    await expect(results).toBeVisible();
    await expect(
      results.getByText(`Playwright Import Squat ${suffix}`),
    ).toBeVisible();
    await expect(results.getByText("Will be created").first()).toBeVisible();

    await page.getByRole("button", { name: "Import into my library" }).click();

    await expect(
      results.getByText(/Imported 1 exercise, 1 workout, and 1 plan/),
    ).toBeVisible();

    await page.goto(
      `/app/library/exercises?search=${encodeURIComponent(`Playwright Import Squat ${suffix}`)}`,
    );
    await expect(
      page
        .locator('section[aria-label="Exercises"] > div')
        .filter({ hasText: `Playwright Import Squat ${suffix}` }),
    ).toBeVisible();
  });

  test("manager cannot commit a bundle with an unresolved reference", async ({
    context,
    page,
  }, testInfo) => {
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;

    await usePersona(context, "manager");
    await page.goto("/app/library/import");

    await page.getByLabel("Paste JSON").fill(
      JSON.stringify({
        formatVersion: 1,
        workouts: [
          {
            name: `Playwright Import Broken Workout ${suffix}`,
            blocks: [
              {
                type: "straight",
                rounds: 1,
                items: [
                  {
                    exercise: `Playwright Nonexistent Movement ${suffix}`,
                    reps: 5,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    await page.getByRole("button", { name: "Check this import" }).click();

    await expect(
      page.locator('section[aria-label="Import errors"]'),
    ).toContainText("Nonexistent Movement");
    await expect(
      page.getByRole("button", { name: "Import into my library" }),
    ).toHaveCount(0);
  });

  test("manager sees a single diagnostic for malformed JSON", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto("/app/library/import");

    await page.getByLabel("Paste JSON").fill('{ "formatVersion": 1, }');
    await page.getByRole("button", { name: "Check this import" }).click();

    const errors = page.locator('section[aria-label="Import errors"]');
    await expect(errors).toContainText("not valid JSON");
    await expect(errors.locator("li")).toHaveCount(1);
  });

  test("an uploaded file produces the same preview as pasted JSON", async ({
    context,
    page,
  }, testInfo) => {
    const suffix = `file-${testInfo.workerIndex}-${Date.now()}`;

    await usePersona(context, "manager");
    await page.goto("/app/library/import");

    await page.getByLabel("Upload a JSON file").setInputFiles({
      name: "library.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bundle(suffix))),
    });
    await page.getByRole("button", { name: "Check this import" }).click();

    const results = page.locator('section[aria-label="Import results"]');
    await expect(
      results.getByText(`Playwright Import Squat ${suffix}`),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Import into my library" }),
    ).toBeVisible();
  });

  test("viewer cannot reach the import route", async ({ context, page }) => {
    await usePersona(context, "viewer");
    await page.goto("/app/library/import");

    await expect(page).toHaveURL(
      /\/app\/library\/workouts\?error=forbidden_import$/,
    );
    await expect(
      page.getByRole("link", { name: "Import", exact: true }),
    ).toHaveCount(0);
  });

  test("the published schema is readable without signing in", async ({
    request,
  }) => {
    const response = await request.get("/schemas/library-import/v1.json");

    expect(response.status()).toBe(200);

    const schema = await response.json();

    expect(schema.$id).toContain("/schemas/library-import/v1.json");
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(["exercises", "workouts", "plans"]),
    );
  });
});
