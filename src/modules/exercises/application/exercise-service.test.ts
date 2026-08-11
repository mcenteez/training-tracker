import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import type { Exercise } from "@/modules/exercises/db/schema";

import {
  archiveExercise,
  createExercise,
  restoreExercise,
  updateExercise,
  type ExerciseTransaction,
  type ExerciseUnitOfWork,
} from "./exercise-service";

const exerciseInput = {
  name: "Back Squat",
  instructions: "Brace before descending.",
  category: "strength" as const,
  equipment: ["barbell", "rack"],
  videoUrl: null,
};

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "exercise-1",
    organizationId: "organization-1",
    name: "Back Squat",
    instructions: null,
    category: "strength",
    equipment: [],
    videoUrl: null,
    status: "active",
    archivedAt: null,
    version: 1,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createTestUnitOfWork(overrides: Partial<ExerciseTransaction> = {}): {
  transaction: ExerciseTransaction;
  unitOfWork: ExerciseUnitOfWork;
} {
  const transaction: ExerciseTransaction = {
    findOrganizationRole: vi.fn(async () => "manager" as const),
    listTeamRoles: vi.fn(async () => []),
    activeNameExists: vi.fn(async () => false),
    findExercise: vi.fn(async () => exercise()),
    createExercise: vi.fn(async () => exercise()),
    updateExercise: vi.fn(async () => exercise({ version: 2 })),
    setExerciseStatus: vi.fn(async ({ status }) =>
      exercise({
        status,
        archivedAt: status === "archived" ? new Date() : null,
        version: 2,
      }),
    ),
    ...overrides,
  };
  const unitOfWork: ExerciseUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };

  return { transaction, unitOfWork };
}

describe("exercise service", () => {
  it("allows an Organization Manager to create an exercise", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork();

    await createExercise(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      exercise: exerciseInput,
    });

    expect(transaction.createExercise).toHaveBeenCalledOnce();
  });

  it("allows a Team Manager to manage the shared library", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamRoles: vi.fn(async () => ["manager" as const]),
    });

    await createExercise(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      exercise: exerciseInput,
    });

    expect(transaction.createExercise).toHaveBeenCalledOnce();
  });

  it("denies viewers and athlete-only users mutation access", async () => {
    for (const organizationRole of ["viewer", "athlete"] as const) {
      const { transaction, unitOfWork } = createTestUnitOfWork({
        findOrganizationRole: vi.fn(async () => organizationRole),
        listTeamRoles: vi.fn(async () => []),
      });

      await expect(
        createExercise(unitOfWork, {
          organizationId: "organization-1",
          actorUserId: "user-1",
          exercise: exerciseInput,
        }),
      ).rejects.toThrow(AuthorizationError);
      expect(transaction.createExercise).not.toHaveBeenCalled();
    }
  });

  it("rejects active names already used in the organization", async () => {
    const { unitOfWork } = createTestUnitOfWork({
      activeNameExists: vi.fn(async () => true),
    });

    await expect(
      createExercise(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        exercise: exerciseInput,
      }),
    ).rejects.toThrow(DomainInvariantError);
  });

  it("does not update an exercise outside the organization", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork({
      findExercise: vi.fn(async () => null),
    });

    await expect(
      updateExercise(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        exerciseId: "foreign-exercise",
        expectedVersion: 1,
        exercise: exerciseInput,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
    expect(transaction.updateExercise).not.toHaveBeenCalled();
  });

  it("rejects stale updates", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork({
      findExercise: vi.fn(async () => exercise({ version: 2 })),
    });

    await expect(
      updateExercise(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        exerciseId: "exercise-1",
        expectedVersion: 1,
        exercise: exerciseInput,
      }),
    ).rejects.toThrow(DomainInvariantError);
    expect(transaction.updateExercise).not.toHaveBeenCalled();
  });

  it("archives and restores an exercise with version checks", async () => {
    const archived = createTestUnitOfWork();
    await archiveExercise(archived.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      exerciseId: "exercise-1",
      expectedVersion: 1,
    });
    expect(archived.transaction.setExerciseStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );

    const restored = createTestUnitOfWork({
      findExercise: vi.fn(async () =>
        exercise({ status: "archived", archivedAt: new Date() }),
      ),
    });
    await restoreExercise(restored.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      exerciseId: "exercise-1",
      expectedVersion: 1,
    });
    expect(restored.transaction.setExerciseStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
  });
});
