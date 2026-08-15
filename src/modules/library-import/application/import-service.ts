import { AuthorizationError } from "@/modules/access-control/errors";
import { resolveLibraryAccess } from "@/modules/access-control/library-access";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";
import type { PlanDayOfWeek } from "@/modules/plans/db/schema";
import { workoutBlockTypes } from "@/modules/workouts/db/schema";
import type { Resistance } from "@/modules/resistance/application/resistance";

import type { LibraryImportBundle } from "./bundle-input";
import {
  normalizeImportName,
  type LibraryImportConflictStrategy,
} from "./format";
import { buildImportPlan, type ImportPlanResult } from "./import-plan";

export interface NamedRecord {
  id: string;
  name: string;
}

export interface NamedWorkoutRecord extends NamedRecord {
  status: "draft" | "active" | "archived";
}

export type LibraryImportMode = "draft" | "activate";

export interface CreateWorkoutInput {
  organizationId: string;
  actorUserId: string;
  status: "draft" | "active";
  workout: {
    name: string;
    description: string | null;
    blocks: {
      type: (typeof workoutBlockTypes)[number];
      label: string | null;
      rounds: number;
      items: {
        exerciseId: string;
        reps: number | null;
        load: string | null;
        resistance?: Resistance | null;
        durationSeconds: number | null;
        distanceMeters: number | null;
        restSeconds: number | null;
        tempo: string | null;
        notes: string | null;
      }[];
    }[];
  };
}

export interface CreatePlanInput {
  organizationId: string;
  actorUserId: string;
  status: "draft" | "active";
  plan: {
    name: string;
    description: string | null;
    scheduleSlots: (
      | {
          scheduleType: "fixed_day";
          workoutId: string;
          dayOfWeek: PlanDayOfWeek;
          label: string | null;
        }
      | {
          scheduleType: "weekly_frequency";
          workoutId: string;
          targetSessionsPerWeek: number;
          label: string | null;
        }
    )[];
  };
}

export interface LibraryImportTransaction {
  findOrganizationRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  listTeamRoles(organizationId: string, userId: string): Promise<TeamRole[]>;
  listActiveExercises(organizationId: string): Promise<NamedRecord[]>;
  listUnarchivedWorkouts(organizationId: string): Promise<NamedWorkoutRecord[]>;
  listUnarchivedPlans(organizationId: string): Promise<NamedRecord[]>;
  createExercises(input: {
    organizationId: string;
    actorUserId: string;
    exercises: readonly LibraryImportBundle["exercises"][number][];
  }): Promise<NamedRecord[]>;
  createWorkout(input: CreateWorkoutInput): Promise<NamedRecord>;
  createPlan(input: CreatePlanInput): Promise<NamedRecord>;
}

export interface LibraryImportUnitOfWork {
  transaction<Result>(
    operation: (transaction: LibraryImportTransaction) => Promise<Result>,
  ): Promise<Result>;
}

export interface LibraryImportRequest {
  organizationId: string;
  actorUserId: string;
  bundle: LibraryImportBundle;
  conflictStrategy?: LibraryImportConflictStrategy;
  mode?: LibraryImportMode;
}

export interface LibraryImportCounts {
  exercises: number;
  workouts: number;
  plans: number;
}

export type CommitLibraryImportResult =
  | { status: "rejected"; plan: ImportPlanResult }
  | {
      status: "imported";
      plan: ImportPlanResult;
      created: LibraryImportCounts;
    };

async function requireLibraryManagement(
  transaction: LibraryImportTransaction,
  input: { organizationId: string; actorUserId: string },
): Promise<void> {
  const organizationRole = await transaction.findOrganizationRole(
    input.organizationId,
    input.actorUserId,
  );
  if (!organizationRole) throw new AuthorizationError();

  const teamRoles = await transaction.listTeamRoles(
    input.organizationId,
    input.actorUserId,
  );
  if (resolveLibraryAccess({ organizationRole, teamRoles }) !== "manage") {
    throw new AuthorizationError();
  }
}

async function planImport(
  transaction: LibraryImportTransaction,
  request: LibraryImportRequest,
): Promise<{
  plan: ImportPlanResult;
  existingExercises: NamedRecord[];
  existingWorkouts: NamedWorkoutRecord[];
}> {
  const [existingExercises, existingWorkouts, existingPlans] =
    await Promise.all([
      transaction.listActiveExercises(request.organizationId),
      transaction.listUnarchivedWorkouts(request.organizationId),
      transaction.listUnarchivedPlans(request.organizationId),
    ]);

  const basePlan = buildImportPlan({
    bundle: request.bundle,
    existingExerciseNames: existingExercises.map((record) => record.name),
    existingWorkoutNames: existingWorkouts.map((record) => record.name),
    existingPlanNames: existingPlans.map((record) => record.name),
    conflictStrategy: request.conflictStrategy,
  });

  if ((request.mode ?? "draft") === "draft" || !basePlan.canCommit) {
    return { plan: basePlan, existingExercises, existingWorkouts };
  }

  const importedWorkoutNames = new Set(
    basePlan.workouts
      .filter((entry) => entry.action === "create")
      .map((entry) => normalizeImportName(entry.name)),
  );
  const activeWorkoutNames = new Set(
    existingWorkouts
      .filter((workout) => workout.status === "active")
      .map((workout) => normalizeImportName(workout.name)),
  );
  const activationDiagnostics = [
    ...basePlan.workouts.flatMap((entry, index) =>
      entry.action === "create" &&
      (entry.input.blocks.length === 0 ||
        entry.input.blocks.some((block) => block.items.length === 0))
        ? [
            {
              severity: "error" as const,
              entity: "workout" as const,
              location: `workouts[${index}].blocks`,
              code: "not_activatable",
              message: `"${entry.name}" must have at least one item in every block to be activated. Import it as a draft instead.`,
            },
          ]
        : [],
    ),
    ...basePlan.plans.flatMap((entry, index) => {
      if (entry.action !== "create") return [];
      if (entry.input.scheduleSlots.length === 0) {
        return [
          {
            severity: "error" as const,
            entity: "plan" as const,
            location: `plans[${index}].scheduleSlots`,
            code: "not_activatable",
            message: `"${entry.name}" needs at least one scheduled session to be activated. Import it as a draft instead.`,
          },
        ];
      }
      const inactiveReference = entry.input.scheduleSlots.find((slot) => {
        const name = normalizeImportName(slot.workout);
        return !importedWorkoutNames.has(name) && !activeWorkoutNames.has(name);
      });
      return inactiveReference
        ? [
            {
              severity: "error" as const,
              entity: "plan" as const,
              location: `plans[${index}].scheduleSlots`,
              code: "inactive_workout",
              message: `"${entry.name}" references "${inactiveReference.workout}", which is not active. Activate that workout or import this bundle as drafts.`,
            },
          ]
        : [];
    }),
  ];
  const plan = {
    ...basePlan,
    diagnostics: [...basePlan.diagnostics, ...activationDiagnostics],
    canCommit: activationDiagnostics.length === 0,
  };

  return { plan, existingExercises, existingWorkouts };
}

function indexByName(records: readonly NamedRecord[]): Map<string, string> {
  return new Map(
    records.map((record) => [normalizeImportName(record.name), record.id]),
  );
}

function requireId(index: Map<string, string>, name: string): string {
  const id = index.get(normalizeImportName(name));

  if (!id) {
    // Planning proved every reference resolves, so this means the library changed underneath us.
    throw new Error(`Unresolved import reference: ${name}`);
  }

  return id;
}

export async function previewLibraryImport(
  unitOfWork: LibraryImportUnitOfWork,
  request: LibraryImportRequest,
): Promise<ImportPlanResult> {
  return unitOfWork.transaction(async (transaction) => {
    await requireLibraryManagement(transaction, request);
    const { plan } = await planImport(transaction, request);
    return plan;
  });
}

export async function commitLibraryImport(
  unitOfWork: LibraryImportUnitOfWork,
  request: LibraryImportRequest,
): Promise<CommitLibraryImportResult> {
  return unitOfWork.transaction(async (transaction) => {
    await requireLibraryManagement(transaction, request);

    const { plan, existingExercises, existingWorkouts } = await planImport(
      transaction,
      request,
    );

    if (!plan.canCommit) {
      return { status: "rejected", plan };
    }

    const exercisesToCreate = plan.exercises
      .filter((entry) => entry.action === "create")
      .map((entry) => entry.input);

    const createdExercises = exercisesToCreate.length
      ? await transaction.createExercises({
          organizationId: request.organizationId,
          actorUserId: request.actorUserId,
          exercises: exercisesToCreate,
        })
      : [];

    const exerciseIds = indexByName([
      ...existingExercises,
      ...createdExercises,
    ]);
    const workoutIds = indexByName(existingWorkouts);

    let createdWorkouts = 0;

    for (const entry of plan.workouts) {
      if (entry.action !== "create") continue;

      const created = await transaction.createWorkout({
        organizationId: request.organizationId,
        actorUserId: request.actorUserId,
        status: request.mode === "activate" ? "active" : "draft",
        workout: {
          name: entry.input.name,
          description: entry.input.description,
          blocks: entry.input.blocks.map((block) => ({
            type: block.type,
            label: block.label,
            rounds: block.rounds,
            items: block.items.map((item) => ({
              exerciseId: requireId(exerciseIds, item.exercise),
              reps: item.reps,
              load: item.load,
              resistance: item.resistance ?? null,
              durationSeconds: item.durationSeconds,
              distanceMeters: item.distanceMeters,
              restSeconds: item.restSeconds,
              tempo: item.tempo,
              notes: item.notes,
            })),
          })),
        },
      });

      workoutIds.set(normalizeImportName(created.name), created.id);
      createdWorkouts += 1;
    }

    let createdPlans = 0;

    for (const entry of plan.plans) {
      if (entry.action !== "create") continue;

      await transaction.createPlan({
        organizationId: request.organizationId,
        actorUserId: request.actorUserId,
        status: request.mode === "activate" ? "active" : "draft",
        plan: {
          name: entry.input.name,
          description: entry.input.description,
          scheduleSlots: entry.input.scheduleSlots.map((slot) =>
            slot.scheduleType === "fixed_day"
              ? {
                  scheduleType: "fixed_day",
                  workoutId: requireId(workoutIds, slot.workout),
                  dayOfWeek: slot.dayOfWeek,
                  label: slot.label,
                }
              : {
                  scheduleType: "weekly_frequency",
                  workoutId: requireId(workoutIds, slot.workout),
                  targetSessionsPerWeek: slot.targetSessionsPerWeek,
                  label: slot.label,
                },
          ),
        },
      });

      createdPlans += 1;
    }

    return {
      status: "imported",
      plan,
      created: {
        exercises: createdExercises.length,
        workouts: createdWorkouts,
        plans: createdPlans,
      },
    };
  });
}
