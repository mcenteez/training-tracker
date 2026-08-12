import { expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

function testDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required for E2E fixtures");
  return neon(databaseUrl);
}

export async function markCompletedAssignmentLate(
  assignmentId: string,
): Promise<void> {
  const sql = testDatabase();
  await sql.transaction([
    sql`
      UPDATE assignments
      SET timeliness_policy_effective_at = now() - interval '2 hours'
      WHERE id = ${assignmentId}
    `,
    sql`
      UPDATE assignment_sessions
      SET due_at = submitted_at - interval '1 hour'
      WHERE assignment_id = ${assignmentId}
        AND submitted_at IS NOT NULL
    `,
  ]);
}

export async function backdateAssignmentBeyondLateWindow(
  assignmentId: string,
): Promise<void> {
  const sql = testDatabase();
  await sql`
    UPDATE assignments
    SET scheduled_date = current_date - 8,
        timeliness_policy_effective_at = now() - interval '10 days',
        available_from = NULL,
        available_until = NULL
    WHERE id = ${assignmentId}
  `;
}

export async function readPublishedPlanPolicy(assignmentId: string): Promise<{
  policyVersion: number;
  scheduleTypes: string[];
}> {
  const sql = testDatabase();
  const assignments = await sql`
    SELECT timeliness_policy_version
    FROM assignments
    WHERE id = ${assignmentId}
  `;
  const slots = await sql`
    SELECT schedule_type
    FROM assignment_plan_slot_snapshots
    WHERE assignment_id = ${assignmentId}
    ORDER BY position
  `;
  return {
    policyVersion: Number(assignments[0]?.timeliness_policy_version),
    scheduleTypes: slots.map((slot) => String(slot.schedule_type)),
  };
}

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
