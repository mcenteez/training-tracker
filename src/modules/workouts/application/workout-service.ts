import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import { resolveLibraryAccess } from "@/modules/access-control/library-access";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";
import type {
  WorkoutBlockInput,
  WorkoutGraphInput,
} from "@/modules/workouts/application/workout-input";
import type { Workout, WorkoutStatus } from "@/modules/workouts/db/schema";

export interface WorkoutTransaction {
  findOrganizationRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  listTeamRoles(organizationId: string, userId: string): Promise<TeamRole[]>;
  findWorkout(
    organizationId: string,
    workoutId: string,
  ): Promise<Workout | null>;
  unarchivedNameExists(
    organizationId: string,
    name: string,
    excludeWorkoutId?: string,
  ): Promise<boolean>;
  activeExerciseIdsExist(
    organizationId: string,
    exerciseIds: readonly string[],
  ): Promise<boolean>;
  createWorkout(input: {
    organizationId: string;
    actorUserId: string;
    sourceWorkoutId?: string;
    graph: WorkoutGraphInput;
    status: "draft" | "active";
  }): Promise<Workout>;
  updateWorkout(input: {
    organizationId: string;
    workoutId: string;
    actorUserId: string;
    expectedVersion: number;
    graph: WorkoutGraphInput;
    status: "draft" | "active";
  }): Promise<Workout | null>;
  replaceStructure(
    organizationId: string,
    workoutId: string,
    blocks: readonly WorkoutBlockInput[],
  ): Promise<void>;
  copyStructure(
    organizationId: string,
    sourceWorkoutId: string,
    targetWorkoutId: string,
  ): Promise<void>;
  setWorkoutStatus(input: {
    organizationId: string;
    workoutId: string;
    actorUserId: string;
    expectedVersion: number;
    status: WorkoutStatus;
  }): Promise<Workout | null>;
}

export interface WorkoutUnitOfWork {
  transaction<Result>(
    operation: (transaction: WorkoutTransaction) => Promise<Result>,
  ): Promise<Result>;
}

async function requireWorkoutManagement(
  transaction: WorkoutTransaction,
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

function requireActivatable(graph: WorkoutGraphInput): void {
  if (
    graph.blocks.length === 0 ||
    graph.blocks.some((block) => block.items.length === 0)
  ) {
    throw new DomainInvariantError(
      "Active workouts require at least one item in every block.",
    );
  }
}

async function requireValidExercises(
  transaction: WorkoutTransaction,
  organizationId: string,
  graph: WorkoutGraphInput,
): Promise<void> {
  const exerciseIds = [
    ...new Set(
      graph.blocks.flatMap((block) =>
        block.items.map((item) => item.exerciseId),
      ),
    ),
  ];

  if (
    exerciseIds.length > 0 &&
    !(await transaction.activeExerciseIdsExist(organizationId, exerciseIds))
  ) {
    throw new DomainInvariantError(
      "Every workout item must use an active exercise in this organization.",
    );
  }
}

async function requireUniqueName(
  transaction: WorkoutTransaction,
  input: { organizationId: string; name: string; excludeWorkoutId?: string },
): Promise<void> {
  if (
    await transaction.unarchivedNameExists(
      input.organizationId,
      input.name,
      input.excludeWorkoutId,
    )
  ) {
    throw new DomainInvariantError(
      "An unarchived workout already uses this name.",
    );
  }
}

export async function createWorkout(
  unitOfWork: WorkoutUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    graph: WorkoutGraphInput;
    status: "draft" | "active";
  },
): Promise<Workout> {
  return unitOfWork.transaction(async (transaction) => {
    await requireWorkoutManagement(transaction, input);
    if (input.status === "active") requireActivatable(input.graph);
    await requireUniqueName(transaction, {
      organizationId: input.organizationId,
      name: input.graph.name,
    });
    await requireValidExercises(transaction, input.organizationId, input.graph);

    const workout = await transaction.createWorkout(input);
    await transaction.replaceStructure(
      input.organizationId,
      workout.id,
      input.graph.blocks,
    );
    return workout;
  });
}

export async function saveWorkout(
  unitOfWork: WorkoutUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    workoutId: string;
    expectedVersion: number;
    graph: WorkoutGraphInput;
    status: "draft" | "active";
  },
): Promise<Workout> {
  return unitOfWork.transaction(async (transaction) => {
    await requireWorkoutManagement(transaction, input);
    const current = await transaction.findWorkout(
      input.organizationId,
      input.workoutId,
    );
    if (!current) throw new ResourceNotFoundError("Workout");
    if (current.status === "archived") {
      throw new DomainInvariantError("Restore this workout before editing it.");
    }
    if (current.version !== input.expectedVersion) {
      throw new DomainInvariantError(
        "This workout was updated by someone else. Reload and try again.",
      );
    }
    if (input.status === "active") requireActivatable(input.graph);
    await requireUniqueName(transaction, {
      organizationId: input.organizationId,
      name: input.graph.name,
      excludeWorkoutId: input.workoutId,
    });
    await requireValidExercises(transaction, input.organizationId, input.graph);

    const workout = await transaction.updateWorkout(input);
    if (!workout) {
      throw new DomainInvariantError(
        "This workout was updated by someone else. Reload and try again.",
      );
    }
    await transaction.replaceStructure(
      input.organizationId,
      input.workoutId,
      input.graph.blocks,
    );
    return workout;
  });
}

export async function duplicateWorkout(
  unitOfWork: WorkoutUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    workoutId: string;
  },
): Promise<Workout> {
  return unitOfWork.transaction(async (transaction) => {
    await requireWorkoutManagement(transaction, input);
    const source = await transaction.findWorkout(
      input.organizationId,
      input.workoutId,
    );
    if (!source) throw new ResourceNotFoundError("Workout");

    let name = `${source.name} Copy`;
    let suffix = 2;
    while (await transaction.unarchivedNameExists(input.organizationId, name)) {
      name = `${source.name} Copy ${suffix++}`;
    }

    const duplicate = await transaction.createWorkout({
      ...input,
      sourceWorkoutId: source.id,
      graph: { name, description: source.description, blocks: [] },
      status: "draft",
    });
    await transaction.copyStructure(
      input.organizationId,
      source.id,
      duplicate.id,
    );
    return duplicate;
  });
}

async function changeWorkoutStatus(
  unitOfWork: WorkoutUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    workoutId: string;
    expectedVersion: number;
    status: "archived" | "draft";
  },
): Promise<Workout> {
  return unitOfWork.transaction(async (transaction) => {
    await requireWorkoutManagement(transaction, input);
    const current = await transaction.findWorkout(
      input.organizationId,
      input.workoutId,
    );
    if (!current) throw new ResourceNotFoundError("Workout");
    if (current.version !== input.expectedVersion) {
      throw new DomainInvariantError(
        "This workout was updated by someone else. Reload and try again.",
      );
    }
    if (current.status === input.status) {
      throw new DomainInvariantError(`Workout is already ${input.status}.`);
    }
    if (input.status === "draft") {
      await requireUniqueName(transaction, {
        organizationId: input.organizationId,
        name: current.name,
        excludeWorkoutId: current.id,
      });
    }
    const workout = await transaction.setWorkoutStatus(input);
    if (!workout) throw new DomainInvariantError("Workout changed. Reload.");
    return workout;
  });
}

export function archiveWorkout(
  unitOfWork: WorkoutUnitOfWork,
  input: Omit<Parameters<typeof changeWorkoutStatus>[1], "status">,
) {
  return changeWorkoutStatus(unitOfWork, { ...input, status: "archived" });
}

export function restoreWorkout(
  unitOfWork: WorkoutUnitOfWork,
  input: Omit<Parameters<typeof changeWorkoutStatus>[1], "status">,
) {
  return changeWorkoutStatus(unitOfWork, { ...input, status: "draft" });
}
