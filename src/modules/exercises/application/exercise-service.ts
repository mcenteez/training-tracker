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
import type { ExerciseInput } from "@/modules/exercises/application/exercise-input";
import type { Exercise, ExerciseStatus } from "@/modules/exercises/db/schema";

export type ExerciseRecord = Exercise;

export interface ExerciseTransaction {
  findOrganizationRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  listTeamRoles(organizationId: string, userId: string): Promise<TeamRole[]>;
  activeNameExists(
    organizationId: string,
    name: string,
    excludeExerciseId?: string,
  ): Promise<boolean>;
  findExercise(
    organizationId: string,
    exerciseId: string,
  ): Promise<ExerciseRecord | null>;
  createExercise(input: {
    organizationId: string;
    actorUserId: string;
    exercise: ExerciseInput;
  }): Promise<ExerciseRecord>;
  updateExercise(input: {
    organizationId: string;
    exerciseId: string;
    actorUserId: string;
    expectedVersion: number;
    exercise: ExerciseInput;
  }): Promise<ExerciseRecord | null>;
  setExerciseStatus(input: {
    organizationId: string;
    exerciseId: string;
    actorUserId: string;
    expectedVersion: number;
    status: ExerciseStatus;
  }): Promise<ExerciseRecord | null>;
}

export interface ExerciseUnitOfWork {
  transaction<Result>(
    operation: (transaction: ExerciseTransaction) => Promise<Result>,
  ): Promise<Result>;
}

async function requireExerciseManagement(
  transaction: ExerciseTransaction,
  input: { organizationId: string; actorUserId: string },
): Promise<void> {
  const organizationRole = await transaction.findOrganizationRole(
    input.organizationId,
    input.actorUserId,
  );

  if (!organizationRole) {
    throw new AuthorizationError();
  }

  const teamRoles = await transaction.listTeamRoles(
    input.organizationId,
    input.actorUserId,
  );

  if (resolveLibraryAccess({ organizationRole, teamRoles }) !== "manage") {
    throw new AuthorizationError();
  }
}

function requireCurrentVersion(
  exercise: ExerciseRecord,
  expectedVersion: number,
): void {
  if (exercise.version !== expectedVersion) {
    throw new DomainInvariantError(
      "This exercise was updated by someone else. Reload and try again.",
    );
  }
}

async function requireUniqueActiveName(
  transaction: ExerciseTransaction,
  input: {
    organizationId: string;
    name: string;
    excludeExerciseId?: string;
  },
): Promise<void> {
  if (
    await transaction.activeNameExists(
      input.organizationId,
      input.name,
      input.excludeExerciseId,
    )
  ) {
    throw new DomainInvariantError(
      "An active exercise already uses this name.",
    );
  }
}

export async function createExercise(
  unitOfWork: ExerciseUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    exercise: ExerciseInput;
  },
): Promise<ExerciseRecord> {
  return unitOfWork.transaction(async (transaction) => {
    await requireExerciseManagement(transaction, input);
    await requireUniqueActiveName(transaction, {
      organizationId: input.organizationId,
      name: input.exercise.name,
    });

    return transaction.createExercise(input);
  });
}

export async function updateExercise(
  unitOfWork: ExerciseUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    exerciseId: string;
    expectedVersion: number;
    exercise: ExerciseInput;
  },
): Promise<ExerciseRecord> {
  return unitOfWork.transaction(async (transaction) => {
    await requireExerciseManagement(transaction, input);
    const current = await transaction.findExercise(
      input.organizationId,
      input.exerciseId,
    );

    if (!current) {
      throw new ResourceNotFoundError("Exercise");
    }

    if (current.status === "archived") {
      throw new DomainInvariantError(
        "Restore this exercise before editing it.",
      );
    }

    requireCurrentVersion(current, input.expectedVersion);
    await requireUniqueActiveName(transaction, {
      organizationId: input.organizationId,
      name: input.exercise.name,
      excludeExerciseId: input.exerciseId,
    });

    const updated = await transaction.updateExercise({
      organizationId: input.organizationId,
      exerciseId: input.exerciseId,
      actorUserId: input.actorUserId,
      expectedVersion: input.expectedVersion,
      exercise: input.exercise,
    });

    if (!updated) {
      throw new DomainInvariantError(
        "This exercise was updated by someone else. Reload and try again.",
      );
    }

    return updated;
  });
}

async function changeExerciseStatus(
  unitOfWork: ExerciseUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    exerciseId: string;
    expectedVersion: number;
    status: ExerciseStatus;
  },
): Promise<ExerciseRecord> {
  return unitOfWork.transaction(async (transaction) => {
    await requireExerciseManagement(transaction, input);
    const current = await transaction.findExercise(
      input.organizationId,
      input.exerciseId,
    );

    if (!current) {
      throw new ResourceNotFoundError("Exercise");
    }

    requireCurrentVersion(current, input.expectedVersion);

    if (current.status === input.status) {
      throw new DomainInvariantError(`Exercise is already ${input.status}.`);
    }

    if (input.status === "active") {
      await requireUniqueActiveName(transaction, {
        organizationId: input.organizationId,
        name: current.name,
        excludeExerciseId: current.id,
      });
    }

    const updated = await transaction.setExerciseStatus(input);

    if (!updated) {
      throw new DomainInvariantError(
        "This exercise was updated by someone else. Reload and try again.",
      );
    }

    return updated;
  });
}

export function archiveExercise(
  unitOfWork: ExerciseUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    exerciseId: string;
    expectedVersion: number;
  },
): Promise<ExerciseRecord> {
  return changeExerciseStatus(unitOfWork, { ...input, status: "archived" });
}

export function restoreExercise(
  unitOfWork: ExerciseUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    exerciseId: string;
    expectedVersion: number;
  },
): Promise<ExerciseRecord> {
  return changeExerciseStatus(unitOfWork, { ...input, status: "active" });
}
