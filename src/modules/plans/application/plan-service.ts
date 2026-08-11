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
  PlanInput,
  PlanScheduleSlotInput,
} from "@/modules/plans/application/plan-input";
import type { Plan, PlanStatus } from "@/modules/plans/db/schema";

export interface PlanTransaction {
  findOrganizationRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  listTeamRoles(organizationId: string, userId: string): Promise<TeamRole[]>;
  findPlan(organizationId: string, planId: string): Promise<Plan | null>;
  unarchivedNameExists(
    organizationId: string,
    name: string,
    excludePlanId?: string,
  ): Promise<boolean>;
  workoutIdsExist(
    organizationId: string,
    workoutIds: readonly string[],
  ): Promise<boolean>;
  activeWorkoutIdsExist(
    organizationId: string,
    workoutIds: readonly string[],
  ): Promise<boolean>;
  createPlan(input: {
    organizationId: string;
    actorUserId: string;
    plan: PlanInput;
    status: "draft" | "active";
  }): Promise<Plan>;
  updatePlan(input: {
    organizationId: string;
    planId: string;
    actorUserId: string;
    expectedVersion: number;
    plan: PlanInput;
    status: "draft" | "active";
  }): Promise<Plan | null>;
  replaceScheduleSlots(
    organizationId: string,
    planId: string,
    scheduleSlots: readonly PlanScheduleSlotInput[],
  ): Promise<void>;
  copyScheduleSlots(
    organizationId: string,
    sourcePlanId: string,
    targetPlanId: string,
  ): Promise<void>;
  setPlanStatus(input: {
    organizationId: string;
    planId: string;
    actorUserId: string;
    expectedVersion: number;
    status: PlanStatus;
  }): Promise<Plan | null>;
}

export interface PlanUnitOfWork {
  transaction<Result>(
    operation: (transaction: PlanTransaction) => Promise<Result>,
  ): Promise<Result>;
}

async function requirePlanManagement(
  transaction: PlanTransaction,
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

function requireActivatable(plan: PlanInput): void {
  if (plan.scheduleSlots.length === 0) {
    throw new DomainInvariantError(
      "Active plans require at least one scheduled session.",
    );
  }
}

async function requireUniqueName(
  transaction: PlanTransaction,
  input: { organizationId: string; name: string; excludePlanId?: string },
): Promise<void> {
  if (
    await transaction.unarchivedNameExists(
      input.organizationId,
      input.name,
      input.excludePlanId,
    )
  ) {
    throw new DomainInvariantError(
      "An unarchived plan already uses this name.",
    );
  }
}

async function requireValidWorkouts(
  transaction: PlanTransaction,
  organizationId: string,
  scheduleSlots: readonly PlanScheduleSlotInput[],
): Promise<void> {
  const workoutIds = [...new Set(scheduleSlots.map((slot) => slot.workoutId))];

  if (
    workoutIds.length > 0 &&
    !(await transaction.workoutIdsExist(organizationId, workoutIds))
  ) {
    throw new DomainInvariantError(
      "Every scheduled session must reference a workout in this organization.",
    );
  }
}

async function requireActiveWorkouts(
  transaction: PlanTransaction,
  organizationId: string,
  scheduleSlots: readonly PlanScheduleSlotInput[],
): Promise<void> {
  const workoutIds = [...new Set(scheduleSlots.map((slot) => slot.workoutId))];

  if (
    workoutIds.length > 0 &&
    !(await transaction.activeWorkoutIdsExist(organizationId, workoutIds))
  ) {
    throw new DomainInvariantError(
      "Active plans can reference only active workouts.",
    );
  }
}

export async function createPlan(
  unitOfWork: PlanUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    plan: PlanInput;
    status: "draft" | "active";
  },
): Promise<Plan> {
  return unitOfWork.transaction(async (transaction) => {
    await requirePlanManagement(transaction, input);
    if (input.status === "active") requireActivatable(input.plan);
    await requireUniqueName(transaction, {
      organizationId: input.organizationId,
      name: input.plan.name,
    });
    await requireValidWorkouts(
      transaction,
      input.organizationId,
      input.plan.scheduleSlots,
    );
    if (input.status === "active") {
      await requireActiveWorkouts(
        transaction,
        input.organizationId,
        input.plan.scheduleSlots,
      );
    }

    const createdPlan = await transaction.createPlan(input);
    await transaction.replaceScheduleSlots(
      input.organizationId,
      createdPlan.id,
      input.plan.scheduleSlots,
    );

    return createdPlan;
  });
}

export async function savePlan(
  unitOfWork: PlanUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    planId: string;
    expectedVersion: number;
    plan: PlanInput;
    status: "draft" | "active";
  },
): Promise<Plan> {
  return unitOfWork.transaction(async (transaction) => {
    await requirePlanManagement(transaction, input);
    const current = await transaction.findPlan(
      input.organizationId,
      input.planId,
    );
    if (!current) throw new ResourceNotFoundError("Plan");
    if (current.status === "archived") {
      throw new DomainInvariantError("Restore this plan before editing it.");
    }
    if (current.version !== input.expectedVersion) {
      throw new DomainInvariantError(
        "This plan was updated by someone else. Reload and try again.",
      );
    }
    if (input.status === "active") requireActivatable(input.plan);
    await requireUniqueName(transaction, {
      organizationId: input.organizationId,
      name: input.plan.name,
      excludePlanId: input.planId,
    });
    await requireValidWorkouts(
      transaction,
      input.organizationId,
      input.plan.scheduleSlots,
    );
    if (input.status === "active") {
      await requireActiveWorkouts(
        transaction,
        input.organizationId,
        input.plan.scheduleSlots,
      );
    }

    const updatedPlan = await transaction.updatePlan(input);
    if (!updatedPlan) {
      throw new DomainInvariantError(
        "This plan was updated by someone else. Reload and try again.",
      );
    }

    await transaction.replaceScheduleSlots(
      input.organizationId,
      input.planId,
      input.plan.scheduleSlots,
    );
    return updatedPlan;
  });
}

export async function duplicatePlan(
  unitOfWork: PlanUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    planId: string;
  },
): Promise<Plan> {
  return unitOfWork.transaction(async (transaction) => {
    await requirePlanManagement(transaction, input);
    const source = await transaction.findPlan(
      input.organizationId,
      input.planId,
    );
    if (!source) throw new ResourceNotFoundError("Plan");

    let name = `${source.name} Copy`;
    let suffix = 2;
    while (await transaction.unarchivedNameExists(input.organizationId, name)) {
      name = `${source.name} Copy ${suffix++}`;
    }

    const duplicate = await transaction.createPlan({
      ...input,
      plan: { name, description: source.description, scheduleSlots: [] },
      status: "draft",
    });
    await transaction.copyScheduleSlots(
      input.organizationId,
      source.id,
      duplicate.id,
    );

    return duplicate;
  });
}

async function changePlanStatus(
  unitOfWork: PlanUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    planId: string;
    expectedVersion: number;
    status: "archived" | "draft";
  },
): Promise<Plan> {
  return unitOfWork.transaction(async (transaction) => {
    await requirePlanManagement(transaction, input);
    const current = await transaction.findPlan(
      input.organizationId,
      input.planId,
    );
    if (!current) throw new ResourceNotFoundError("Plan");
    if (current.version !== input.expectedVersion) {
      throw new DomainInvariantError(
        "This plan was updated by someone else. Reload and try again.",
      );
    }

    if (input.status === "archived" && current.status === "archived") {
      throw new DomainInvariantError("This plan is already archived.");
    }
    if (input.status === "draft" && current.status !== "archived") {
      throw new DomainInvariantError("Only archived plans can be restored.");
    }

    if (input.status === "draft") {
      await requireUniqueName(transaction, {
        organizationId: input.organizationId,
        name: current.name,
        excludePlanId: current.id,
      });
    }

    const updatedPlan = await transaction.setPlanStatus(input);
    if (!updatedPlan) {
      throw new DomainInvariantError(
        "This plan was updated by someone else. Reload and try again.",
      );
    }
    return updatedPlan;
  });
}

export async function archivePlan(
  unitOfWork: PlanUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    planId: string;
    expectedVersion: number;
  },
): Promise<Plan> {
  return changePlanStatus(unitOfWork, { ...input, status: "archived" });
}

export async function restorePlan(
  unitOfWork: PlanUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    planId: string;
    expectedVersion: number;
  },
): Promise<Plan> {
  return changePlanStatus(unitOfWork, { ...input, status: "draft" });
}
