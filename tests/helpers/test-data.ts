import { expect, type Page } from "@playwright/test";

export async function createExercise(
  page: Page,
  name: string,
  category = "strength",
): Promise<void> {
  await page.goto("/app/library/exercises/new");
  await page.getByLabel("Exercise name").fill(name);
  await page.getByLabel("Category").selectOption(category);
  await page.getByRole("button", { name: "Create exercise" }).click();
  await expect(page).toHaveURL(/\/app\/library\/exercises\?created=1$/);
}

export async function createWorkout(
  page: Page,
  name: string,
  exerciseName: string,
  reps = "5",
): Promise<string> {
  await page.goto("/app/library/workouts/new");
  await page.getByLabel("Workout name").fill(name);
  await page.getByRole("button", { name: "Add block" }).click();
  const block = page.getByRole("region", { name: "Block 1" });
  await block.getByRole("button", { name: "Add exercise" }).click();
  await block.getByLabel("Exercise").selectOption({ label: exerciseName });
  await block.getByLabel("Reps").fill(reps);
  await page.getByRole("button", { name: "Activate workout" }).click();
  await expect(page).toHaveURL(/\/app\/library\/workouts\/[^/]+\?saved=1$/);
  return new URL(page.url()).pathname;
}

export async function publishWorkoutAssignment(
  page: Page,
  workoutName: string,
  scheduledDate: string,
  teamName = "Basketball",
): Promise<string> {
  await page.goto("/app/assignments/new");
  await page.locator('label:has(input[aria-label="Assign a workout"])').click();
  await page
    .getByLabel("Choose a workout")
    .selectOption({ label: workoutName });
  await page.getByLabel("Scheduled date").fill(scheduledDate);
  await page.getByRole("button", { name: "Teams" }).click();
  await page.getByRole("option", { name: teamName }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save Draft and Review" }).click();
  await expect(page).toHaveURL(/\/app\/assignments\/[^/]+\?created=1$/);
  await page.getByRole("button", { name: "Publish Assignment" }).click();
  await page.getByRole("button", { name: "Confirm Publication" }).click();
  await expect(page).toHaveURL(/\/app\/assignments\/[^/]+\?published=1$/);
  return new URL(page.url()).pathname;
}

export async function completeAssignedWorkout(
  page: Page,
  workoutName: string,
  actualReps = "6",
): Promise<string> {
  await page.goto("/app/athlete");
  const assignment = page.locator("li").filter({ hasText: workoutName });
  await assignment.getByRole("link", { name: "Open" }).click();
  await page.getByRole("button", { name: "Start Workout" }).click();
  await expect(page.getByText("Workout started.")).toBeVisible();
  await page.getByText("Actuals and notes", { exact: true }).click();
  await page.getByLabel("Actual reps").fill(actualReps);
  await page.getByRole("button", { name: "Complete Workout" }).click();
  await expect(page.getByText("Workout completed.")).toBeVisible();
  return page.url();
}
