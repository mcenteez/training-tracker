import { expect, test } from "@playwright/test";

import { testIds, usePersona } from "./helpers/persona";
import {
  backdateAssignmentBeyondLateWindow,
  completeAssignedWorkout,
  createExercise,
  createWorkout,
  markCompletedAssignmentLate,
  publishWorkoutAssignment,
  readPublishedPlanPolicy,
} from "./helpers/test-data";

const { basketballTeamId } = testIds;

test.describe("Training Tracker assignment and performance access", () => {
  test("team manager can open assignment creation for managed targets", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto("/app/assignments/new");

    await expect(page).toHaveURL(/\/app\/assignments\/new$/);
    await expect(
      page.getByRole("heading", { name: "New Assignment", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Teams" }).click();
    await expect(
      page.getByRole("option", { name: "Basketball" }),
    ).toBeVisible();
    await page.getByRole("option", { name: "Basketball" }).click();
    await expect(
      page.getByRole("button", { name: "Save Draft and Review" }),
    ).toBeVisible();
  });

  test("viewer and athlete cannot create assignments", async ({
    context,
    page,
  }) => {
    await usePersona(context, "viewer");
    await page.goto("/app/assignments");
    await expect(page).toHaveURL(/\/app\/performance\/organization$/);

    await usePersona(context, "athlete");
    await page.goto("/app/assignments/new");
    await expect(page).toHaveURL(/\/app\/athlete$/);
  });

  test("invalid assignment route parameters fail safely", async ({
    context,
    page,
  }) => {
    await usePersona(context, "manager");
    await page.goto("/app/assignments/not-a-uuid");

    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });

  test("manager can view empty team performance windows", async ({
    context,
    page,
  }, testInfo) => {
    await usePersona(context, "manager");
    await page.goto(`/app/performance/teams/${basketballTeamId}`);

    await expect(page).toHaveURL(
      new RegExp(`/app/performance/teams/${basketballTeamId}$`),
    );
    await expect(page.getByText("Basketball", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Workout compliance", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Metric definitions" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /first completed submission occurred before the due instant/i,
      ),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("team-dashboard-desktop.png"),
      fullPage: true,
    });

    await page.getByRole("link", { name: "90 days" }).click();
    await expect(page).toHaveURL(/\?window=90$/);
    await page.getByRole("link", { name: "All time" }).click();
    await expect(page).toHaveURL(/\?window=all$/);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("team-dashboard-mobile.png"),
      fullPage: true,
    });
  });

  test("viewer can read team performance but athlete cannot", async ({
    context,
    page,
  }) => {
    await usePersona(context, "viewer");
    await page.goto(`/app/performance/teams/${basketballTeamId}`);
    await expect(page).toHaveURL(
      new RegExp(`/app/performance/teams/${basketballTeamId}$`),
    );
    await usePersona(context, "athlete");
    const response = await page.goto(
      `/app/performance/teams/${basketballTeamId}`,
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });

  test("manager can publish directly to a managed athlete", async ({
    context,
    page,
  }, testInfo) => {
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const exerciseName = `Playwright Direct Exercise ${suffix}`;
    const workoutName = `Playwright Direct Workout ${suffix}`;

    await usePersona(context, "manager");
    await createExercise(page, exerciseName);
    await createWorkout(page, workoutName, exerciseName);

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
    await page.getByRole("button", { name: "Individual athletes" }).click();
    await page.getByRole("option", { name: /Local Athlete/ }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save Draft and Review" }).click();
    await expect(page).toHaveURL(/\/app\/assignments\/[^/]+\?created=1$/);
    await page.getByRole("button", { name: "Publish Assignment" }).click();
    await page.getByRole("button", { name: "Confirm Publication" }).click();
    await expect(page).toHaveURL(/\/app\/assignments\/[^/]+\?published=1$/);
    const assignmentId = new URL(page.url()).pathname.split("/").pop();
    expect(assignmentId).toBeTruthy();

    await usePersona(context, "athlete");
    await page.goto("/app/athlete");
    const assignment = page.locator("li").filter({ hasText: workoutName });
    await expect(assignment.getByRole("link", { name: "Open" })).toBeVisible();

    await usePersona(context, "revokedManager");
    await page.goto(`/app/athlete/assignments/${assignmentId}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });

  test("late completion is visible and closed late-entry is rejected", async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const exerciseName = `Playwright Timeliness Exercise ${suffix}`;
    const lateWorkoutName = `Playwright Late Workout ${suffix}`;
    const closedWorkoutName = `Playwright Closed Workout ${suffix}`;
    const today = new Date().toISOString().slice(0, 10);

    await usePersona(context, "manager");
    await createExercise(page, exerciseName);
    await createWorkout(page, lateWorkoutName, exerciseName);
    const lateAssignmentPath = await publishWorkoutAssignment(
      page,
      lateWorkoutName,
      today,
    );
    const lateAssignmentId = lateAssignmentPath.split("/").pop()!;

    await usePersona(context, "athlete");
    await completeAssignedWorkout(page, lateWorkoutName);
    await markCompletedAssignmentLate(lateAssignmentId);

    await usePersona(context, "manager");
    await page.goto(`/app/performance/teams/${basketballTeamId}`);
    await page.getByText(lateWorkoutName, { exact: true }).click();
    const lateResult = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("link", { name: "Review" }) });
    await expect(lateResult).toContainText("Completed late");

    await createWorkout(page, closedWorkoutName, exerciseName);
    const closedAssignmentPath = await publishWorkoutAssignment(
      page,
      closedWorkoutName,
      today,
    );
    const closedAssignmentId = closedAssignmentPath.split("/").pop()!;
    await backdateAssignmentBeyondLateWindow(closedAssignmentId);

    await usePersona(context, "athlete");
    await page.goto("/app/athlete");
    const closedAssignment = page
      .locator("li")
      .filter({ hasText: closedWorkoutName });
    await closedAssignment.getByRole("link", { name: "Open" }).click();
    await page.getByRole("button", { name: "Start Workout" }).click();
    await expect(
      page.getByText(
        "The seven-day late-entry window for this workout has closed.",
      ),
    ).toBeVisible();
  });

  test("manager publishes fixed and weekly plan training with policy version one", async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const exerciseName = `Playwright Plan Exercise ${suffix}`;
    const workoutName = `Playwright Plan Workout ${suffix}`;
    const planName = `Playwright Mixed Plan ${suffix}`;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 14);

    await usePersona(context, "manager");
    await createExercise(page, exerciseName);
    await createWorkout(page, workoutName, exerciseName);
    await page.goto("/app/library/plans/new");
    await page.getByLabel("Plan name").fill(planName);
    await page.getByRole("button", { name: "Add session" }).click();
    const fixed = page.getByRole("region", { name: "Scheduled session 1" });
    await fixed.getByLabel("Workout template").selectOption({
      label: workoutName,
    });
    await page.getByRole("button", { name: "Add session" }).click();
    const weekly = page.getByRole("region", { name: "Scheduled session 2" });
    await weekly.getByLabel("Schedule mode").selectOption("weekly_frequency");
    await weekly.getByLabel("Sessions per week").fill("2");
    await weekly.getByLabel("Workout template").selectOption({
      label: workoutName,
    });
    await page.getByRole("button", { name: "Activate plan" }).click();
    await expect(page).toHaveURL(/\/app\/library\/plans\/[^/]+\?saved=1$/);

    await page.goto("/app/assignments/new");
    await page.getByLabel("Choose a plan").selectOption({ label: planName });
    await page
      .getByLabel("Start date")
      .fill(startDate.toISOString().slice(0, 10));
    await page.getByLabel("End date").fill(endDate.toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Teams" }).click();
    await page.getByRole("option", { name: "Basketball" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save Draft and Review" }).click();
    await page.getByRole("button", { name: "Publish Assignment" }).click();
    await page.getByRole("button", { name: "Confirm Publication" }).click();
    await expect(page).toHaveURL(/\/app\/assignments\/[^/]+\?published=1$/);
    const assignmentId = new URL(page.url()).pathname.split("/").pop()!;

    await expect(readPublishedPlanPolicy(assignmentId)).resolves.toEqual({
      policyVersion: 1,
      scheduleTypes: ["fixed_day", "weekly_frequency"],
    });
  });

  test("manager can publish a workout and athlete can complete it", async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const exerciseName = `Playwright Assignment Exercise ${suffix}`;
    const workoutName = `Playwright Assignment Workout ${suffix}`;
    const scheduledDate = new Date().toISOString().slice(0, 10);

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
    const workoutPath = new URL(page.url()).pathname;

    await page.goto("/app/assignments/new");
    await page
      .locator('label:has(input[aria-label="Assign a workout"])')
      .click();
    await page
      .getByLabel("Choose a workout")
      .selectOption({ label: workoutName });
    await page.getByLabel("Scheduled date").fill(scheduledDate);
    await page.getByRole("button", { name: "Teams" }).click();
    await page.getByRole("option", { name: "Basketball" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save Draft and Review" }).click();
    await expect(page).toHaveURL(/\/app\/assignments\/[^/]+\?created=1$/);
    await expect(page.getByText("Draft created.")).toBeVisible();

    await page.getByRole("button", { name: "Publish Assignment" }).click();
    await page.getByRole("button", { name: "Confirm Publication" }).click();
    await expect(page).toHaveURL(/\/app\/assignments\/[^/]+\?published=1$/);
    await expect(
      page.getByText("Assignment published and visible to recipients."),
    ).toBeVisible();
    const assignmentPath = new URL(page.url()).pathname;

    await usePersona(context, "viewer");
    await page.goto(assignmentPath);
    await expect(page).toHaveURL(/\/app\/performance\/organization$/);
    await expect(
      page.getByRole("button", { name: "Publish Assignment" }),
    ).toHaveCount(0);

    await usePersona(context, "athlete");
    await page.goto(assignmentPath);
    await expect(page).toHaveURL(/\/app\/athlete$/);

    await usePersona(context, "manager");
    await page.goto(`${workoutPath}/edit`);
    await page.getByLabel("Reps").fill("10");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(new RegExp(`${workoutPath}\\?saved=1$`));

    await usePersona(context, "athlete");
    await page.goto("/app/athlete");
    const athleteAssignment = page
      .locator("li")
      .filter({ hasText: workoutName });
    await expect(
      athleteAssignment.getByRole("link", { name: "Open" }),
    ).toBeVisible();
    await completeAssignedWorkout(page, workoutName, "6");
    await expect(page.getByText("Reps 5", { exact: true })).toBeVisible();
    const athleteOccurrenceUrl = page.url();
    await page.getByRole("link", { name: "Edit results" }).click();
    await page.getByLabel("Actual reps").fill("8");
    await page.getByRole("button", { name: "Save Progress" }).click();
    await expect(page.getByText("Progress saved.")).toBeVisible();
    await expect(page.getByText("Status: Completed")).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("athlete-occurrence-mobile.png"),
      fullPage: true,
    });

    await usePersona(context, "manager");
    await page.goto(`/app/performance/teams/${basketballTeamId}`);
    await expect(page.getByText(workoutName, { exact: true })).toBeVisible();
    await page.getByText(workoutName, { exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    const athleteResult = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("link", { name: "Review" }) });
    await expect(athleteResult).toBeVisible();
    await expect(athleteResult).toContainText("Completed");
    await expect(athleteResult).toContainText("On time");
    await expect(
      page
        .getByRole("region", { name: "Assignment timeliness summary" })
        .getByText("On-time completion", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("assignment-timeliness-mobile.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Review" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/performance/teams/${basketballTeamId}/assignments/`),
    );
    await expect(
      page.getByRole("heading", { name: "Completed results" }),
    ).toBeVisible();
    await page
      .getByLabel("Add staff comment")
      .fill("Great consistency on this session.");
    await page.getByRole("button", { name: "Add comment" }).click();
    await expect(
      page.getByText("Great consistency on this session.", { exact: true }),
    ).toBeVisible();

    const reviewUrl = page.url();
    await usePersona(context, "viewer");
    await page.goto(reviewUrl);
    await expect(
      page.getByText("Great consistency on this session.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Add staff comment")).toHaveCount(0);
    expect(athleteOccurrenceUrl).toContain("submitted=1");
  });
});
