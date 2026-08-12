import { describe, expect, it } from "vitest";

import type { LibraryImportBundle } from "./bundle-input";
import { buildImportPlan, type BuildImportPlanInput } from "./import-plan";

function exercise(name: string): LibraryImportBundle["exercises"][number] {
  return {
    name,
    instructions: null,
    category: "strength",
    equipment: [],
    videoUrl: null,
  };
}

function workout(
  name: string,
  exerciseName: string,
): LibraryImportBundle["workouts"][number] {
  return {
    name,
    description: null,
    blocks: [
      {
        type: "straight",
        label: null,
        rounds: 1,
        items: [
          {
            exercise: exerciseName,
            reps: 5,
            load: null,
            durationSeconds: null,
            distanceMeters: null,
            restSeconds: null,
            tempo: null,
            notes: null,
          },
        ],
      },
    ],
  };
}

function plan(
  name: string,
  workoutName: string,
): LibraryImportBundle["plans"][number] {
  return {
    name,
    description: null,
    scheduleSlots: [
      {
        scheduleType: "fixed_day",
        workout: workoutName,
        dayOfWeek: "monday",
        label: null,
      },
    ],
  };
}

function planInput(
  overrides: Partial<Omit<BuildImportPlanInput, "bundle">> & {
    bundle?: Partial<LibraryImportBundle>;
  } = {},
): BuildImportPlanInput {
  const { bundle, ...rest } = overrides;

  return {
    existingExerciseNames: [],
    existingWorkoutNames: [],
    existingPlanNames: [],
    ...rest,
    bundle: {
      formatVersion: 1,
      exercises: [],
      workouts: [],
      plans: [],
      ...bundle,
    },
  };
}

function codes(result: ReturnType<typeof buildImportPlan>) {
  return result.diagnostics.map((entry) => entry.code);
}

describe("buildImportPlan", () => {
  it("plans a full bundle that references itself", () => {
    const result = buildImportPlan(
      planInput({
        bundle: {
          exercises: [exercise("Back Squat")],
          workouts: [workout("Lower Body A", "Back Squat")],
          plans: [plan("Offseason Base", "Lower Body A")],
        },
      }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.canCommit).toBe(true);
    expect(result.exercises[0]?.action).toBe("create");
    expect(result.workouts[0]?.action).toBe("create");
    expect(result.plans[0]?.action).toBe("create");
  });

  it("resolves a reference to an exercise listed after the workout", () => {
    const result = buildImportPlan(
      planInput({
        bundle: {
          exercises: [exercise("Back Squat")],
          workouts: [workout("Lower Body A", "Back Squat")],
        },
      }),
    );

    expect(result.canCommit).toBe(true);
  });

  it("matches existing names ignoring case and surrounding space", () => {
    const result = buildImportPlan(
      planInput({
        existingExerciseNames: ["back squat"],
        bundle: {
          exercises: [exercise("  Back Squat  ")],
          workouts: [workout("Lower Body A", "BACK SQUAT")],
        },
      }),
    );

    expect(codes(result)).toEqual(["already_exists"]);
    expect(result.exercises[0]?.action).toBe("skip_existing");
    expect(result.canCommit).toBe(true);
  });

  it("reports an existing name as a warning that does not block commit", () => {
    const result = buildImportPlan(
      planInput({
        existingExerciseNames: ["Back Squat"],
        bundle: {
          exercises: [exercise("Back Squat"), exercise("Front Squat")],
        },
      }),
    );

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "warning",
      code: "already_exists",
      location: "exercises[0].name",
    });
    expect(result.canCommit).toBe(true);
  });

  it("aborts on an existing name when the strategy is fail", () => {
    const result = buildImportPlan(
      planInput({
        existingExerciseNames: ["Back Squat"],
        conflictStrategy: "fail",
        bundle: {
          exercises: [exercise("Back Squat"), exercise("Front Squat")],
        },
      }),
    );

    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.canCommit).toBe(false);
  });

  it("rejects duplicate names within the file regardless of strategy", () => {
    const result = buildImportPlan(
      planInput({
        bundle: { exercises: [exercise("Back Squat"), exercise("back squat")] },
      }),
    );

    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "duplicate_name",
      location: "exercises[1].name",
    });
    expect(result.exercises).toHaveLength(1);
    expect(result.canCommit).toBe(false);
  });

  it("reports an unresolved exercise reference", () => {
    const result = buildImportPlan(
      planInput({
        bundle: { workouts: [workout("Lower Body A", "Deadlift")] },
      }),
    );

    expect(result.diagnostics[0]).toMatchObject({
      code: "unknown_exercise",
      location: "workouts[0].blocks[0].items[0].exercise",
    });
    expect(result.canCommit).toBe(false);
  });

  it("reports an unresolved workout reference", () => {
    const result = buildImportPlan(
      planInput({ bundle: { plans: [plan("Offseason Base", "Missing")] } }),
    );

    expect(result.diagnostics[0]).toMatchObject({
      code: "unknown_workout",
      location: "plans[0].scheduleSlots[0].workout",
    });
    expect(result.canCommit).toBe(false);
  });

  it("does not validate the contents of a skipped entity", () => {
    const result = buildImportPlan(
      planInput({
        existingWorkoutNames: ["Lower Body A"],
        bundle: { workouts: [workout("Lower Body A", "Deadlift")] },
      }),
    );

    expect(codes(result)).not.toContain("unknown_exercise");
  });

  it("lets a plan reference a workout that already exists in the library", () => {
    const result = buildImportPlan(
      planInput({
        existingWorkoutNames: ["Lower Body A"],
        bundle: { plans: [plan("Offseason Base", "Lower Body A")] },
      }),
    );

    expect(result.canCommit).toBe(true);
  });

  it("blocks a commit when everything already exists", () => {
    const result = buildImportPlan(
      planInput({
        existingExerciseNames: ["Back Squat"],
        bundle: { exercises: [exercise("Back Squat")] },
      }),
    );

    expect(codes(result)).toContain("nothing_to_create");
    expect(result.canCommit).toBe(false);
  });
});
