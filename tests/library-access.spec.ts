import { expect, test } from "@playwright/test";

import { usePersona } from "./helpers/persona";
import {
  createExercise,
  createWorkout,
  createWorkoutDraft,
} from "./helpers/test-data";

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

  test("manager can duplicate an active workout into an independent draft", async ({
    context,
    page,
  }, testInfo) => {
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const exerciseName = `Playwright Duplicate Exercise ${suffix}`;
    const workoutName = `Playwright Duplicate Workout ${suffix}`;

    await usePersona(context, "manager");
    await createExercise(page, exerciseName);
    await createWorkout(page, workoutName, exerciseName);

    await page.goto("/app/library/workouts");
    const sourceCard = page
      .locator('section[aria-label="Workouts"] > div')
      .filter({ hasText: workoutName });
    await sourceCard.getByRole("button", { name: "Duplicate" }).click();

    await expect(page).toHaveURL(/\/app\/library\/workouts\/[^/]+\/edit$/);
    await expect(page.getByLabel("Workout name")).toHaveValue(
      `${workoutName} Copy`,
    );
    await expect(page.getByRole("region", { name: "Block 1" })).toBeVisible();
    await page.getByLabel("Workout name").fill(`${workoutName} Copy Final`);
    await page.getByRole("button", { name: "Activate workout" }).click();

    await expect(page).toHaveURL(/\/app\/library\/workouts\/[^/]+\?saved=1$/);
    await expect(
      page.getByText(`${workoutName} Copy Final`, { exact: true }),
    ).toBeVisible();
    await page.goto("/app/library/workouts");
    await expect(page.getByText(workoutName, { exact: true })).toBeVisible();
    await expect(
      page.getByText(`${workoutName} Copy Final`, { exact: true }),
    ).toBeVisible();
  });

  test("manager can activate a plan and its referenced draft workouts atomically", async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const exerciseName = `Playwright Plan Activation Exercise ${suffix}`;
    const firstWorkoutName = `Playwright Draft Push ${suffix}`;
    const secondWorkoutName = `Playwright Draft Pull ${suffix}`;
    const planName = `Playwright Atomic Plan ${suffix}`;

    await usePersona(context, "manager");
    await createExercise(page, exerciseName);
    await createWorkoutDraft(page, firstWorkoutName, exerciseName);
    await createWorkoutDraft(page, secondWorkoutName, exerciseName);

    await page.goto("/app/library/plans/new");
    await page.getByLabel("Plan name").fill(planName);
    await page.getByRole("button", { name: "Add session" }).click();
    await page
      .getByRole("region", { name: "Scheduled session 1" })
      .getByLabel("Workout template")
      .selectOption({ label: `${firstWorkoutName} (draft)` });
    await page.getByRole("button", { name: "Add session" }).click();
    await page
      .getByRole("region", { name: "Scheduled session 2" })
      .getByLabel("Workout template")
      .selectOption({ label: `${secondWorkoutName} (draft)` });

    const activationOption = page.getByLabel(
      "Activate 2 referenced draft workouts with this plan",
    );
    await expect(activationOption).toBeVisible();
    const activationLabel = activationOption.locator("..");
    await expect(activationLabel).toContainText(firstWorkoutName);
    await expect(activationLabel).toContainText(secondWorkoutName);
    await activationOption.check();
    await page.getByRole("button", { name: "Activate plan" }).click();

    await expect(page).toHaveURL(/\/app\/library\/plans\/[^/]+\?saved=1$/);
    await expect(page.getByText(planName, { exact: true })).toBeVisible();
    await expect(
      page.getByText("active", { exact: true }).first(),
    ).toBeVisible();

    for (const workoutName of [firstWorkoutName, secondWorkoutName]) {
      await page.goto(
        `/app/library/workouts?search=${encodeURIComponent(workoutName)}`,
      );
      await expect(page.getByText(workoutName, { exact: true })).toBeVisible();
    }
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

  test("library searches remain scoped to the active organization", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");

    await page.goto(
      "/app/library/exercises?search=Foreign%20Organization%20Exercise",
    );
    await expect(
      page.getByText("No exercises found", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Foreign Organization Exercise", { exact: true }),
    ).toHaveCount(0);

    await page.goto(
      "/app/library/workouts?search=Foreign%20Organization%20Workout",
    );
    await expect(
      page.getByText("No workouts found", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Foreign Organization Workout", { exact: true }),
    ).toHaveCount(0);
  });
});
