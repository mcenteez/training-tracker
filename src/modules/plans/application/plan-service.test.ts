import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
} from "@/modules/access-control/errors";
import type { Plan } from "@/modules/plans/db/schema";

import {
  createPlan,
  duplicatePlan,
  savePlan,
  type PlanTransaction,
  type PlanUnitOfWork,
} from "./plan-service";

const planInput = {
  name: "PPL Week 1",
  description: null,
  scheduleSlots: [
    {
      workoutId: "10000000-0000-4000-8000-000000000001",
      cycleWeek: 1,
      dayOfWeek: "monday" as const,
      label: "Push",
    },
  ],
};

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    organizationId: "organization-1",
    name: planInput.name,
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

function setup(overrides: Partial<PlanTransaction> = {}) {
  const transaction: PlanTransaction = {
    findOrganizationRole: vi.fn(async () => "manager" as const),
    listTeamRoles: vi.fn(async () => []),
    findPlan: vi.fn(async () => plan()),
    unarchivedNameExists: vi.fn(async () => false),
    workoutIdsExist: vi.fn(async () => true),
    activeWorkoutIdsExist: vi.fn(async () => true),
    createPlan: vi.fn(async () => plan()),
    updatePlan: vi.fn(async () => plan({ version: 2 })),
    replaceScheduleSlots: vi.fn(async () => undefined),
    copyScheduleSlots: vi.fn(async () => undefined),
    setPlanStatus: vi.fn(async ({ status }) => plan({ status, version: 2 })),
    ...overrides,
  };
  const unitOfWork: PlanUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };
  return { transaction, unitOfWork };
}

describe("plan service", () => {
  it("creates a complete active plan atomically", async () => {
    const { transaction, unitOfWork } = setup();
    await createPlan(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      plan: planInput,
      status: "active",
    });
    expect(transaction.createPlan).toHaveBeenCalledOnce();
    expect(transaction.replaceScheduleSlots).toHaveBeenCalledOnce();
  });

  it("allows empty drafts but rejects incomplete activation", async () => {
    const draft = setup();
    await createPlan(draft.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      plan: { ...planInput, scheduleSlots: [] },
      status: "draft",
    });

    const active = setup();
    await expect(
      createPlan(active.unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        plan: { ...planInput, scheduleSlots: [] },
        status: "active",
      }),
    ).rejects.toThrow(DomainInvariantError);
  });

  it("allows Team Managers and denies viewers", async () => {
    const manager = setup({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamRoles: vi.fn(async () => ["manager" as const]),
    });
    await createPlan(manager.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      plan: planInput,
      status: "draft",
    });

    const viewer = setup({
      findOrganizationRole: vi.fn(async () => "viewer" as const),
    });
    await expect(
      createPlan(viewer.unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        plan: planInput,
        status: "draft",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects foreign or missing workout references", async () => {
    const { unitOfWork } = setup({
      workoutIdsExist: vi.fn(async () => false),
    });
    await expect(
      createPlan(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        plan: planInput,
        status: "draft",
      }),
    ).rejects.toThrow(DomainInvariantError);
  });

  it("requires active workouts when activating a plan", async () => {
    const { unitOfWork } = setup({
      activeWorkoutIdsExist: vi.fn(async () => false),
    });
    await expect(
      createPlan(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        plan: planInput,
        status: "active",
      }),
    ).rejects.toThrow(DomainInvariantError);
  });

  it("rejects stale saves before replacing schedule slots", async () => {
    const { transaction, unitOfWork } = setup({
      findPlan: vi.fn(async () => plan({ version: 2 })),
    });
    await expect(
      savePlan(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        planId: "plan-1",
        expectedVersion: 1,
        plan: planInput,
        status: "draft",
      }),
    ).rejects.toThrow(DomainInvariantError);
    expect(transaction.replaceScheduleSlots).not.toHaveBeenCalled();
  });

  it("duplicates the full schedule into a draft", async () => {
    const { transaction, unitOfWork } = setup();
    await duplicatePlan(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      planId: "plan-1",
    });
    expect(transaction.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
      }),
    );
    expect(transaction.copyScheduleSlots).toHaveBeenCalledOnce();
  });
});
