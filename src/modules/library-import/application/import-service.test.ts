import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/access-control/errors";

import type { LibraryImportBundle } from "./bundle-input";
import {
  commitLibraryImport,
  previewLibraryImport,
  type LibraryImportTransaction,
  type LibraryImportUnitOfWork,
} from "./import-service";

function bundle(
  overrides: Partial<LibraryImportBundle> = {},
): LibraryImportBundle {
  return {
    formatVersion: 1,
    exercises: [
      {
        name: "Back Squat",
        instructions: null,
        category: "strength",
        equipment: [],
        videoUrl: null,
      },
    ],
    workouts: [
      {
        name: "Lower Body A",
        description: null,
        blocks: [
          {
            type: "straight",
            label: null,
            rounds: 1,
            items: [
              {
                exercise: "Back Squat",
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
      },
    ],
    plans: [
      {
        name: "Offseason Base",
        description: null,
        scheduleSlots: [
          {
            scheduleType: "fixed_day",
            workout: "Lower Body A",
            dayOfWeek: "monday",
            label: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createTestUnitOfWork(
  overrides: Partial<LibraryImportTransaction> = {},
) {
  const transaction: LibraryImportTransaction = {
    findOrganizationRole: vi.fn(async () => "manager" as const),
    listTeamRoles: vi.fn(async () => []),
    listActiveExercises: vi.fn(async () => []),
    listUnarchivedWorkouts: vi.fn(async () => []),
    listUnarchivedPlans: vi.fn(async () => []),
    createExercises: vi.fn(
      async ({ exercises }: { exercises: readonly { name: string }[] }) =>
        exercises.map((exercise, index) => ({
          id: `exercise-${index}`,
          name: exercise.name,
        })),
    ),
    createWorkout: vi.fn(async ({ workout }) => ({
      id: "workout-1",
      name: workout.name,
    })),
    createPlan: vi.fn(async ({ plan }) => ({ id: "plan-1", name: plan.name })),
    ...overrides,
  };

  const unitOfWork: LibraryImportUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };

  return { transaction, unitOfWork };
}

const request = {
  organizationId: "organization-1",
  actorUserId: "user-1",
  bundle: bundle(),
};

describe("library import service", () => {
  it("allows an Organization Manager to import a full bundle", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork();

    const result = await commitLibraryImport(unitOfWork, request);

    expect(result.status).toBe("imported");

    if (result.status !== "imported") return;

    expect(result.created).toEqual({ exercises: 1, workouts: 1, plans: 1 });
    expect(transaction.createExercises).toHaveBeenCalledTimes(1);
    expect(transaction.createWorkout).toHaveBeenCalledTimes(1);
    expect(transaction.createPlan).toHaveBeenCalledTimes(1);
    expect(transaction.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
    );
    expect(transaction.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
    );
  });

  it("activates complete imported workouts before their plans", async () => {
    const calls: string[] = [];
    const { transaction, unitOfWork } = createTestUnitOfWork({
      createWorkout: vi.fn(async ({ workout, status }) => {
        calls.push(`workout:${status}`);
        return { id: "workout-1", name: workout.name };
      }),
      createPlan: vi.fn(async ({ plan, status }) => {
        calls.push(`plan:${status}`);
        return { id: "plan-1", name: plan.name };
      }),
    });

    const result = await commitLibraryImport(unitOfWork, {
      ...request,
      mode: "activate",
    });

    expect(result.status).toBe("imported");
    expect(calls).toEqual(["workout:active", "plan:active"]);
    expect(transaction.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    expect(transaction.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
  });

  it("rejects activation of an incomplete workout but permits draft import", async () => {
    const incompleteBundle = bundle({
      plans: [],
      workouts: [
        {
          name: "Incomplete Workout",
          description: null,
          blocks: [],
        },
      ],
    });
    const { transaction, unitOfWork } = createTestUnitOfWork();

    const activation = await previewLibraryImport(unitOfWork, {
      ...request,
      bundle: incompleteBundle,
      mode: "activate",
    });
    const draft = await previewLibraryImport(unitOfWork, {
      ...request,
      bundle: incompleteBundle,
      mode: "draft",
    });

    expect(activation.canCommit).toBe(false);
    expect(activation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "not_activatable" }),
      ]),
    );
    expect(draft.canCommit).toBe(true);
    expect(transaction.createWorkout).not.toHaveBeenCalled();
  });

  it("rejects an active plan that references an existing draft workout", async () => {
    const { unitOfWork } = createTestUnitOfWork({
      listUnarchivedWorkouts: vi.fn(async () => [
        {
          id: "existing-workout",
          name: "Lower Body A",
          status: "draft" as const,
        },
      ]),
    });

    const plan = await previewLibraryImport(unitOfWork, {
      ...request,
      bundle: bundle({ exercises: [], workouts: [] }),
      mode: "activate",
    });

    expect(plan.canCommit).toBe(false);
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "inactive_workout" }),
      ]),
    );
  });

  it("allows a Team Manager to import", async () => {
    const { unitOfWork } = createTestUnitOfWork({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamRoles: vi.fn(async () => ["manager" as const]),
    });

    const result = await commitLibraryImport(unitOfWork, request);

    expect(result.status).toBe("imported");
  });

  it("rejects an Organization Viewer", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork({
      findOrganizationRole: vi.fn(async () => "viewer" as const),
    });

    await expect(commitLibraryImport(unitOfWork, request)).rejects.toThrow(
      AuthorizationError,
    );
    expect(transaction.createExercises).not.toHaveBeenCalled();
  });

  it("rejects an athlete with no managing team role", async () => {
    const { unitOfWork } = createTestUnitOfWork({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamRoles: vi.fn(async () => ["athlete" as const]),
    });

    await expect(commitLibraryImport(unitOfWork, request)).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("rejects a user with no membership in the organization", async () => {
    const { unitOfWork } = createTestUnitOfWork({
      findOrganizationRole: vi.fn(async () => null),
    });

    await expect(commitLibraryImport(unitOfWork, request)).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("scopes every read and write to the caller's organization", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork();

    await commitLibraryImport(unitOfWork, request);

    expect(transaction.listActiveExercises).toHaveBeenCalledWith(
      "organization-1",
    );
    expect(transaction.createExercises).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "organization-1" }),
    );
    expect(transaction.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "organization-1" }),
    );
    expect(transaction.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "organization-1" }),
    );
  });

  it("resolves references to entities created earlier in the same import", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork();

    await commitLibraryImport(unitOfWork, request);

    expect(transaction.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        workout: expect.objectContaining({
          blocks: [
            expect.objectContaining({
              items: [expect.objectContaining({ exerciseId: "exercise-0" })],
            }),
          ],
        }),
      }),
    );
    expect(transaction.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          scheduleSlots: [expect.objectContaining({ workoutId: "workout-1" })],
        }),
      }),
    );
  });

  it("resolves references to entities that already exist in the library", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork({
      listActiveExercises: vi.fn(async () => [
        { id: "existing-exercise", name: "back squat" },
      ]),
    });

    const result = await commitLibraryImport(unitOfWork, request);

    expect(result.status).toBe("imported");

    if (result.status !== "imported") return;

    expect(result.created.exercises).toBe(0);
    expect(transaction.createExercises).not.toHaveBeenCalled();
    expect(transaction.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        workout: expect.objectContaining({
          blocks: [
            expect.objectContaining({
              items: [
                expect.objectContaining({ exerciseId: "existing-exercise" }),
              ],
            }),
          ],
        }),
      }),
    );
  });

  it("writes nothing when the bundle has an unresolved reference", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork();

    const result = await commitLibraryImport(unitOfWork, {
      ...request,
      bundle: bundle({ exercises: [] }),
    });

    expect(result.status).toBe("rejected");
    expect(transaction.createExercises).not.toHaveBeenCalled();
    expect(transaction.createWorkout).not.toHaveBeenCalled();
    expect(transaction.createPlan).not.toHaveBeenCalled();
  });

  it("propagates a mid-import failure so the transaction rolls back", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork({
      createPlan: vi.fn(async () => {
        throw new Error("insert failed");
      }),
    });

    await expect(commitLibraryImport(unitOfWork, request)).rejects.toThrow(
      "insert failed",
    );
    expect(transaction.createWorkout).toHaveBeenCalled();
  });

  it("re-reads existing names inside the commit transaction", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork();

    await previewLibraryImport(unitOfWork, request);
    await commitLibraryImport(unitOfWork, request);

    expect(transaction.listActiveExercises).toHaveBeenCalledTimes(2);
  });

  it("previews without writing anything", async () => {
    const { transaction, unitOfWork } = createTestUnitOfWork();

    const plan = await previewLibraryImport(unitOfWork, request);

    expect(plan.canCommit).toBe(true);
    expect(transaction.createExercises).not.toHaveBeenCalled();
    expect(transaction.createWorkout).not.toHaveBeenCalled();
    expect(transaction.createPlan).not.toHaveBeenCalled();
  });
});
