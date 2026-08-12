import { expect, test, type BrowserContext } from "@playwright/test";

type LocalPersona = "owner" | "manager" | "athlete" | "viewer";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

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

test.describe("Training Tracker library access", () => {
  test("manager can create an exercise from the library flow", async ({
    context,
    page,
  }, testInfo) => {
    const exerciseName = `Playwright Sprint Test ${testInfo.workerIndex}-${Date.now()}`;

    await usePersona(context, "manager");
    await page.goto("/app/library/exercises/new");

    await expect(page).toHaveURL(/\/app\/library\/exercises\/new$/);
    await expect(
      page.getByText("Create exercise", { exact: true }).first(),
    ).toBeVisible();

    await page.getByLabel("Exercise name").fill(exerciseName);
    await page.getByLabel("Category").selectOption("strength");
    await page.getByLabel("Equipment").fill("barbell, rack");
    await page
      .getByLabel("Coaching instructions")
      .fill("Drive through the floor and keep the torso braced.");
    await page.getByRole("button", { name: "Create exercise" }).click();

    await expect(page).toHaveURL(/\/app\/library\/exercises\?created=1$/);
    await expect(page.getByText("Exercise created.")).toBeVisible();
  });

  test("viewer can browse the library but cannot create exercises", async ({
    context,
    page,
  }) => {
    await usePersona(context, "viewer");
    await page.goto("/app/library/exercises");

    await expect(page).toHaveURL(/\/app\/library\/exercises$/);
    await expect(
      page.getByRole("heading", { name: "Exercises", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "New exercise" })).toHaveCount(
      0,
    );

    await page.goto("/app/library/exercises/new");
    await expect(page).toHaveURL(/\/app\/library\/exercises$/);
  });
});
