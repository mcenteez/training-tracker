import type {
  ImportExercise,
  ImportPlan,
  ImportWorkout,
  LibraryImportBundle,
} from "./bundle-input";
import {
  capDiagnostics,
  hasBlockingError,
  type ImportDiagnostic,
  type ImportEntity,
} from "./diagnostics";
import {
  normalizeImportName,
  type LibraryImportConflictStrategy,
} from "./format";

export type PlannedAction = "create" | "skip_existing";

export interface PlannedEntity<TInput> {
  name: string;
  action: PlannedAction;
  input: TInput;
}

export interface ImportPlanResult {
  exercises: PlannedEntity<ImportExercise>[];
  workouts: PlannedEntity<ImportWorkout>[];
  plans: PlannedEntity<ImportPlan>[];
  diagnostics: ImportDiagnostic[];
  canCommit: boolean;
}

export interface BuildImportPlanInput {
  bundle: LibraryImportBundle;
  existingExerciseNames: readonly string[];
  existingWorkoutNames: readonly string[];
  existingPlanNames: readonly string[];
  conflictStrategy?: LibraryImportConflictStrategy;
}

interface NamedEntity {
  name: string;
}

function planEntities<TInput extends NamedEntity>(
  entries: readonly TInput[],
  options: {
    entity: ImportEntity;
    root: string;
    existingNames: ReadonlySet<string>;
    conflictStrategy: LibraryImportConflictStrategy;
    diagnostics: ImportDiagnostic[];
  },
): PlannedEntity<TInput>[] {
  const seen = new Set<string>();

  return entries.flatMap<PlannedEntity<TInput>>((input, index) => {
    const key = normalizeImportName(input.name);
    const location = `${options.root}[${index}]`;

    if (seen.has(key)) {
      options.diagnostics.push({
        severity: "error",
        entity: options.entity,
        location: `${location}.name`,
        code: "duplicate_name",
        message: `"${input.name}" appears more than once in this file. Names must be unique, ignoring case.`,
      });

      return [];
    }

    seen.add(key);

    if (!options.existingNames.has(key)) {
      return [{ name: input.name, action: "create" as const, input }];
    }

    if (options.conflictStrategy === "fail") {
      options.diagnostics.push({
        severity: "error",
        entity: options.entity,
        location: `${location}.name`,
        code: "already_exists",
        message: `"${input.name}" already exists in your library.`,
      });

      return [];
    }

    options.diagnostics.push({
      severity: "warning",
      entity: options.entity,
      location: `${location}.name`,
      code: "already_exists",
      message: `"${input.name}" already exists in your library and will not be created. References to it will use the existing record.`,
    });

    return [{ name: input.name, action: "skip_existing" as const, input }];
  });
}

function resolvableNames(
  existingNames: ReadonlySet<string>,
  planned: readonly PlannedEntity<NamedEntity>[],
): ReadonlySet<string> {
  return new Set([
    ...existingNames,
    ...planned.map((entry) => normalizeImportName(entry.name)),
  ]);
}

export function buildImportPlan(input: BuildImportPlanInput): ImportPlanResult {
  const conflictStrategy = input.conflictStrategy ?? "skip";
  const diagnostics: ImportDiagnostic[] = [];

  const existingExercises = new Set(
    input.existingExerciseNames.map(normalizeImportName),
  );
  const existingWorkouts = new Set(
    input.existingWorkoutNames.map(normalizeImportName),
  );
  const existingPlans = new Set(
    input.existingPlanNames.map(normalizeImportName),
  );

  const exercises = planEntities(input.bundle.exercises, {
    entity: "exercise",
    root: "exercises",
    existingNames: existingExercises,
    conflictStrategy,
    diagnostics,
  });

  const workouts = planEntities(input.bundle.workouts, {
    entity: "workout",
    root: "workouts",
    existingNames: existingWorkouts,
    conflictStrategy,
    diagnostics,
  });

  const plans = planEntities(input.bundle.plans, {
    entity: "plan",
    root: "plans",
    existingNames: existingPlans,
    conflictStrategy,
    diagnostics,
  });

  const knownExercises = resolvableNames(existingExercises, exercises);
  const knownWorkouts = resolvableNames(existingWorkouts, workouts);

  for (const [workoutIndex, workout] of workouts.entries()) {
    if (workout.action === "skip_existing") continue;

    for (const [blockIndex, block] of workout.input.blocks.entries()) {
      for (const [itemIndex, item] of block.items.entries()) {
        if (knownExercises.has(normalizeImportName(item.exercise))) continue;

        diagnostics.push({
          severity: "error",
          entity: "workout",
          location: `workouts[${workoutIndex}].blocks[${blockIndex}].items[${itemIndex}].exercise`,
          code: "unknown_exercise",
          message: `No exercise named "${item.exercise}" is defined in this file or in your library.`,
        });
      }
    }
  }

  for (const [planIndex, plan] of plans.entries()) {
    if (plan.action === "skip_existing") continue;

    for (const [slotIndex, slot] of plan.input.scheduleSlots.entries()) {
      if (knownWorkouts.has(normalizeImportName(slot.workout))) continue;

      diagnostics.push({
        severity: "error",
        entity: "plan",
        location: `plans[${planIndex}].scheduleSlots[${slotIndex}].workout`,
        code: "unknown_workout",
        message: `No workout named "${slot.workout}" is defined in this file or in your library.`,
      });
    }
  }

  const createCount = [...exercises, ...workouts, ...plans].filter(
    (entry) => entry.action === "create",
  ).length;

  if (createCount === 0 && !hasBlockingError(diagnostics)) {
    diagnostics.push({
      severity: "error",
      entity: "bundle",
      location: "(root)",
      code: "nothing_to_create",
      message: "Everything in this file already exists in your library.",
    });
  }

  const capped = capDiagnostics(diagnostics);

  return {
    exercises,
    workouts,
    plans,
    diagnostics: capped,
    canCommit: !hasBlockingError(capped) && createCount > 0,
  };
}
