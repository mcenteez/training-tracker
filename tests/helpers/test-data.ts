import { expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

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

export async function setAssignmentPrescriptionMeasurableLoad(
  assignmentId: string,
  value: number,
  unit: "kg" | "lb",
): Promise<void> {
  const sql = testDatabase();
  const normalizedKg = unit === "kg" ? value : value * 0.45359237;
  await sql`
    UPDATE assignment_workout_item_snapshots
    SET load = ${`${value} ${unit}`},
        load_value = ${value},
        load_unit = ${unit},
        normalized_load_kg = ${normalizedKg}
    WHERE assignment_id = ${assignmentId}
  `;
}

export async function setAssignmentPrescriptionLegacyLoad(
  assignmentId: string,
  load: string,
): Promise<void> {
  const sql = testDatabase();
  await sql`
    UPDATE assignment_workout_item_snapshots
    SET load = ${load},
        load_value = NULL,
        load_unit = NULL,
        normalized_load_kg = NULL
    WHERE assignment_id = ${assignmentId}
  `;
}

export async function readAssignmentSessionCapture(assignmentId: string) {
  const sql = testDatabase();
  const rows = await sql`
    SELECT
      sessions.duration_minutes,
      sessions.session_rpe,
      sessions.submitted_at,
      sessions.due_at,
      results.load,
      results.load_value,
      results.load_unit,
      results.normalized_load_kg
    FROM assignment_sessions sessions
    LEFT JOIN assignment_session_item_results results
      ON results.organization_id = sessions.organization_id
      AND results.assignment_id = sessions.assignment_id
      AND results.session_id = sessions.id
    WHERE sessions.assignment_id = ${assignmentId}
    LIMIT 1
  `;
  const row = rows[0];
  return row
    ? {
        durationMinutes: Number(row.duration_minutes),
        sessionRpe: Number(row.session_rpe),
        submittedAt: String(row.submitted_at),
        dueAt: String(row.due_at),
        load: String(row.load),
        loadValue: String(row.load_value),
        loadUnit: String(row.load_unit),
        normalizedLoadKg: String(row.normalized_load_kg),
      }
    : null;
}

export async function seedAssignmentBaselineSessions(
  assignmentId: string,
  currentScheduledDate: string,
): Promise<void> {
  const sql = testDatabase();
  const contexts = await sql`
    SELECT
      sessions.recipient_id,
      sessions.athlete_user_id,
      workout_snapshots.id AS workout_snapshot_id,
      item_snapshots.id AS item_snapshot_id,
      item_snapshots.reps,
      item_snapshots.load,
      item_snapshots.load_value,
      item_snapshots.load_unit,
      item_snapshots.normalized_load_kg
    FROM assignment_sessions sessions
    INNER JOIN assignment_workout_snapshots workout_snapshots
      ON workout_snapshots.id = sessions.workout_snapshot_id
    INNER JOIN assignment_workout_block_snapshots block_snapshots
      ON block_snapshots.workout_snapshot_id = workout_snapshots.id
    INNER JOIN assignment_workout_item_snapshots item_snapshots
      ON item_snapshots.block_snapshot_id = block_snapshots.id
    WHERE sessions.assignment_id = ${assignmentId}
      AND sessions.status = 'submitted'
      AND sessions.scheduled_date = ${currentScheduledDate}
    LIMIT 1
  `;
  const context = contexts[0];
  if (!context) throw new Error("Assignment baseline context not found");

  for (const [index, durationMinutes] of [20, 30, 40].entries()) {
    const sessionId = randomUUID();
    const date = new Date(`${currentScheduledDate}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - (index + 1));
    const scheduledDate = date.toISOString().slice(0, 10);
    await sql`
      INSERT INTO assignment_sessions (
        id, organization_id, assignment_id, recipient_id, athlete_user_id,
        workout_snapshot_id, scheduled_date, available_from, available_until,
        status, started_at, submitted_at, duration_minutes, session_rpe
      ) VALUES (
        ${sessionId}, '10000000-0000-4000-8000-000000000001', ${assignmentId},
        ${context.recipient_id}, ${context.athlete_user_id},
        ${context.workout_snapshot_id}, ${scheduledDate},
        ${`${scheduledDate}T00:00:00.000Z`}, ${`${scheduledDate}T23:59:59.000Z`},
        'submitted', ${`${scheduledDate}T12:00:00.000Z`},
        ${`${scheduledDate}T13:00:00.000Z`}, ${durationMinutes}, 10
      )
    `;
    await sql`
      INSERT INTO assignment_session_effective_item_prescriptions (
        organization_id, assignment_id, session_id, item_snapshot_id,
        reps, load, load_value, load_unit, normalized_load_kg
      ) VALUES (
        '10000000-0000-4000-8000-000000000001', ${assignmentId}, ${sessionId},
        ${context.item_snapshot_id}, ${context.reps}, ${context.load},
        ${context.load_value}, ${context.load_unit}, ${context.normalized_load_kg}
      )
    `;
    await sql`
      INSERT INTO assignment_session_item_results (
        organization_id, assignment_id, session_id, item_snapshot_id,
        round_number, reps, load, load_value, load_unit, normalized_load_kg
      ) VALUES (
        '10000000-0000-4000-8000-000000000001', ${assignmentId}, ${sessionId},
        ${context.item_snapshot_id}, 1, ${context.reps}, ${context.load},
        ${context.load_value}, ${context.load_unit}, ${context.normalized_load_kg}
      )
    `;
  }
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
