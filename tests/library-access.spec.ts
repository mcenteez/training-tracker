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

  test("manager can edit, archive, and restore an exercise", async ({
    context,
    page,
  }, testInfo) => {
    const exerciseName = `Playwright Lifecycle ${testInfo.workerIndex}-${Date.now()}`;
    const updatedExerciseName = `${exerciseName} Updated`;

    await usePersona(context, "manager");
    await page.goto("/app/library/exercises/new");
    await page.getByLabel("Exercise name").fill(exerciseName);
    await page.getByLabel("Category").selectOption("strength");
    await page.getByRole("button", { name: "Create exercise" }).click();

    await expect(page).toHaveURL(/\/app\/library\/exercises\?created=1$/);
    const exerciseCard = page
      .locator('section[aria-label="Exercises"] > div')
      .filter({ hasText: exerciseName });
    await exerciseCard.getByRole("link", { name: "Edit" }).click();

    await expect(page).toHaveURL(/\/app\/library\/exercises\/[^/]+\/edit$/);
    await page.getByLabel("Exercise name").fill(updatedExerciseName);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(/\/app\/library\/exercises\?updated=1$/);
    const updatedCard = page
      .locator('section[aria-label="Exercises"] > div')
      .filter({ hasText: updatedExerciseName });
    await updatedCard.getByRole("button", { name: "Archive" }).click();

    await expect(page).toHaveURL(/\/app\/library\/exercises\?archived=1$/);
    await page.goto(
      `/app/library/exercises?status=archived&search=${encodeURIComponent(updatedExerciseName)}`,
    );
    const archivedCard = page
      .locator('section[aria-label="Exercises"] > div')
      .filter({ hasText: updatedExerciseName });
    await expect(
      archivedCard.getByText("archived", { exact: true }),
    ).toBeVisible();
    await archivedCard.getByRole("button", { name: "Restore" }).click();

    await expect(page).toHaveURL(/\/app\/library\/exercises\?restored=1$/);
    await expect(
      page.getByText(updatedExerciseName, { exact: true }),
    ).toBeVisible();
  });

  test("manager can activate a workout with multiple blocks", async ({
    context,
    page,
  }, testInfo) => {
    const exerciseName = `Playwright Workout Exercise ${testInfo.workerIndex}-${Date.now()}`;
    const workoutName = `Playwright Workout ${testInfo.workerIndex}-${Date.now()}`;

    await usePersona(context, "manager");
    await page.goto("/app/library/exercises/new");
    await page.getByLabel("Exercise name").fill(exerciseName);
    await page.getByLabel("Category").selectOption("strength");
    await page.getByRole("button", { name: "Create exercise" }).click();
    await expect(page).toHaveURL(/\/app\/library\/exercises\?created=1$/);

    await page.goto("/app/library/workouts/new");
    await page.getByLabel("Workout name").fill(workoutName);
    await page.getByLabel("Description").fill("Two-block Playwright workout.");
    await page.getByRole("button", { name: "Add block" }).click();
    await page.getByRole("button", { name: "Add block" }).click();

    for (const blockNumber of [1, 2]) {
      const block = page.getByRole("region", { name: `Block ${blockNumber}` });
      await block.getByRole("button", { name: "Add exercise" }).click();
      await block.getByLabel("Exercise").selectOption({ label: exerciseName });
      await block.getByLabel("Reps").fill("5");
    }

    await page.getByRole("button", { name: "Activate workout" }).click();
    await expect(page).toHaveURL(/\/app\/library\/workouts\/[^/]+\?saved=1$/);
    await expect(page.getByText(workoutName, { exact: true })).toBeVisible();
    await expect(
      page.getByText("active", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Block 1", { exact: false })).toBeVisible();
    await expect(page.getByText("Block 2", { exact: false })).toBeVisible();
  });

  test("manager cannot activate an empty workout draft", async ({
    context,
    page,
  }, testInfo) => {
    await usePersona(context, "manager");
    await page.goto("/app/library/workouts/new");
    await page
      .getByLabel("Workout name")
      .fill(`Playwright Invalid Workout ${testInfo.workerIndex}-${Date.now()}`);
    await page.getByRole("button", { name: "Activate workout" }).click();

    await expect(page).toHaveURL(/\/app\/library\/workouts\/new$/);
    await expect(
      page.getByText("Active workouts require at least one item", {
        exact: false,
      }),
    ).toBeVisible();
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
