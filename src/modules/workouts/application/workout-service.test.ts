import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
} from "@/modules/access-control/errors";
import type { Workout } from "@/modules/workouts/db/schema";

import {
  createWorkout,
  duplicateWorkout,
  saveWorkout,
  type WorkoutTransaction,
  type WorkoutUnitOfWork,
} from "./workout-service";

const graph = {
  name: "Lower Strength",
  description: null,
  blocks: [
    {
      type: "straight" as const,
      label: null,
      rounds: 3,
      items: [
        {
          exerciseId: "10000000-0000-4000-8000-000000000001",
          reps: 5,
          load: null,
          durationSeconds: null,
          distanceMeters: null,
          restSeconds: 120,
          tempo: null,
          notes: null,
        },
      ],
    },
  ],
};

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    organizationId: "organization-1",
    sourceWorkoutId: null,
    name: graph.name,
    description: null,
    status: "draft",
    archivedAt: null,
    version: 1,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(overrides: Partial<WorkoutTransaction> = {}) {
  const transaction: WorkoutTransaction = {
    findOrganizationRole: vi.fn(async () => "manager" as const),
    listTeamRoles: vi.fn(async () => []),
    findWorkout: vi.fn(async () => workout()),
    unarchivedNameExists: vi.fn(async () => false),
    activeExerciseIdsExist: vi.fn(async () => true),
    createWorkout: vi.fn(async () => workout()),
    updateWorkout: vi.fn(async () => workout({ version: 2 })),
    replaceStructure: vi.fn(async () => undefined),
    copyStructure: vi.fn(async () => undefined),
    setWorkoutStatus: vi.fn(async ({ status }) =>
      workout({ status, version: 2 }),
    ),
    ...overrides,
  };
  const unitOfWork: WorkoutUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };
  return { transaction, unitOfWork };
}

describe("workout service", () => {
  it("creates a complete active workout atomically", async () => {
    const { transaction, unitOfWork } = setup();
    await createWorkout(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      graph,
      status: "active",
    });
    expect(transaction.createWorkout).toHaveBeenCalledOnce();
    expect(transaction.replaceStructure).toHaveBeenCalledOnce();
  });

  it("allows incomplete drafts but rejects incomplete activation", async () => {
    const incomplete = { ...graph, blocks: [] };
    const draft = setup();
    await createWorkout(draft.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      graph: incomplete,
      status: "draft",
    });

    const active = setup();
    await expect(
      createWorkout(active.unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        graph: incomplete,
        status: "active",
      }),
    ).rejects.toThrow(DomainInvariantError);
  });

  it("allows Team Managers and denies viewers", async () => {
    const manager = setup({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamRoles: vi.fn(async () => ["manager" as const]),
    });
    await createWorkout(manager.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      graph,
      status: "draft",
    });

    const viewer = setup({
      findOrganizationRole: vi.fn(async () => "viewer" as const),
    });
    await expect(
      createWorkout(viewer.unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        graph,
        status: "draft",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects foreign or archived exercise references", async () => {
    const { unitOfWork } = setup({
      activeExerciseIdsExist: vi.fn(async () => false),
    });
    await expect(
      createWorkout(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        graph,
        status: "draft",
      }),
    ).rejects.toThrow(DomainInvariantError);
  });

  it("rejects stale saves before replacing structure", async () => {
    const { transaction, unitOfWork } = setup({
      findWorkout: vi.fn(async () => workout({ version: 2 })),
    });
    await expect(
      saveWorkout(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        workoutId: "workout-1",
        expectedVersion: 1,
        graph,
        status: "draft",
      }),
    ).rejects.toThrow(DomainInvariantError);
    expect(transaction.replaceStructure).not.toHaveBeenCalled();
  });

  it("duplicates the full structure into a sourced draft", async () => {
    const { transaction, unitOfWork } = setup();
    await duplicateWorkout(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      workoutId: "workout-1",
    });
    expect(transaction.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceWorkoutId: "workout-1",
        status: "draft",
      }),
    );
    expect(transaction.copyStructure).toHaveBeenCalledOnce();
  });
});
