import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import { hasPermission } from "@/modules/access-control/permissions";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";
import type {
  Assignment,
  AssignmentTarget,
} from "@/modules/assignments/db/schema";
import type {
  AssignmentSourceInput,
  AssignmentTargetInput,
} from "./assignment-input";

interface TeamRoleMembership {
  teamId: string;
  role: TeamRole;
}

interface AssignmentTargetRecord {
  id: string;
  targetType: AssignmentTarget["targetType"];
  teamId: string | null;
  athleteUserId: string | null;
}

export interface AssignmentTransaction {
  findOrganizationRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  listTeamRoles(
    organizationId: string,
    userId: string,
  ): Promise<readonly TeamRoleMembership[]>;
  findAssignment(
    organizationId: string,
    assignmentId: string,
  ): Promise<Assignment | null>;
  findPlan(
    organizationId: string,
    planId: string,
  ): Promise<{ id: string; status: string } | null>;
  findWorkout(
    organizationId: string,
    workoutId: string,
  ): Promise<{ id: string; status: string } | null>;
  createAssignmentDraft(input: {
    organizationId: string;
    actorUserId: string;
    timezone: string;
    source: AssignmentSourceInput;
  }): Promise<Assignment>;
  updateAssignmentDraft(input: {
    organizationId: string;
    assignmentId: string;
    expectedVersion: number;
    actorUserId: string;
    timezone: string;
    source: AssignmentSourceInput;
  }): Promise<Assignment | null>;
  replaceAssignmentTargets(
    organizationId: string,
    assignmentId: string,
    targets: readonly AssignmentTargetInput[],
  ): Promise<void>;
  listAssignmentTargets(
    organizationId: string,
    assignmentId: string,
  ): Promise<readonly AssignmentTargetRecord[]>;
  listAthleteUserIdsForTeam(
    organizationId: string,
    teamId: string,
  ): Promise<readonly string[]>;
  listTeamIdsForAthlete(
    organizationId: string,
    athleteUserId: string,
  ): Promise<readonly string[]>;
  replaceAssignmentRecipients(
    organizationId: string,
    assignmentId: string,
    athleteUserIds: readonly string[],
  ): Promise<void>;
  snapshotAssignmentSource(
    organizationId: string,
    assignmentId: string,
    source: AssignmentSourceInput,
  ): Promise<number>;
  markAssignmentPublished(input: {
    organizationId: string;
    assignmentId: string;
    expectedVersion: number;
    actorUserId: string;
  }): Promise<Assignment | null>;
  markAssignmentCanceled(input: {
    organizationId: string;
    assignmentId: string;
    expectedVersion: number;
    actorUserId: string;
  }): Promise<Assignment | null>;
}

export interface AssignmentUnitOfWork {
  transaction<Result>(
    operation: (transaction: AssignmentTransaction) => Promise<Result>,
  ): Promise<Result>;
}

async function resolveActorAccess(
  transaction: AssignmentTransaction,
  input: { organizationId: string; actorUserId: string },
): Promise<{
  organizationRole: OrganizationRole;
  canAssignOrganization: boolean;
  managedTeamIds: Set<string>;
}> {
  const organizationRole = await transaction.findOrganizationRole(
    input.organizationId,
    input.actorUserId,
  );

  if (!organizationRole) {
    throw new AuthorizationError();
  }

  const canAssignOrganization = hasPermission(
    { organizationRole },
    "workout.assign.organization",
  );

  const teamRoles = await transaction.listTeamRoles(
    input.organizationId,
    input.actorUserId,
  );

  const managedTeamIds = new Set(
    teamRoles
      .filter((teamRole) => teamRole.role === "manager")
      .map((role) => role.teamId),
  );

  const canAssignTeam =
    canAssignOrganization ||
    hasPermission(
      { organizationRole, teamRole: "manager" },
      "workout.assign.team",
    );

  if (!canAssignTeam) {
    throw new AuthorizationError();
  }

  return {
    organizationRole,
    canAssignOrganization,
    managedTeamIds,
  };
}

function assertDraft(
  assignment: Assignment,
  message = "Only draft assignments can be changed.",
): void {
  if (assignment.status !== "draft") {
    throw new DomainInvariantError(message);
  }
}

function assertVersion(actualVersion: number, expectedVersion: number): void {
  if (actualVersion !== expectedVersion) {
    throw new DomainInvariantError(
      "This assignment was updated by someone else. Reload and try again.",
    );
  }
}

async function assertSourceIsActive(
  transaction: AssignmentTransaction,
  input: { organizationId: string; source: AssignmentSourceInput },
): Promise<void> {
  if (input.source.sourceType === "plan") {
    const plan = await transaction.findPlan(
      input.organizationId,
      input.source.sourcePlanId,
    );

    if (!plan) {
      throw new ResourceNotFoundError("Plan");
    }

    if (plan.status !== "active") {
      throw new DomainInvariantError("Only active plans can be published.");
    }

    return;
  }

  const workout = await transaction.findWorkout(
    input.organizationId,
    input.source.sourceWorkoutId,
  );

  if (!workout) {
    throw new ResourceNotFoundError("Workout");
  }

  if (workout.status !== "active") {
    throw new DomainInvariantError("Only active workouts can be published.");
  }
}

async function assertTargetsAllowedForTeamManagerScope(
  transaction: AssignmentTransaction,
  input: {
    organizationId: string;
    targets: readonly AssignmentTargetInput[];
    canAssignOrganization: boolean;
    managedTeamIds: ReadonlySet<string>;
  },
): Promise<void> {
  if (input.canAssignOrganization) {
    return;
  }

  for (const target of input.targets) {
    if (target.targetType === "team") {
      if (!input.managedTeamIds.has(target.teamId)) {
        throw new AuthorizationError();
      }
      continue;
    }

    const teamIds = await transaction.listTeamIdsForAthlete(
      input.organizationId,
      target.athleteUserId,
    );

    if (!teamIds.some((teamId) => input.managedTeamIds.has(teamId))) {
      throw new AuthorizationError();
    }
  }
}

async function resolveRecipientUserIds(
  transaction: AssignmentTransaction,
  input: {
    organizationId: string;
    targets: readonly AssignmentTargetRecord[];
  },
): Promise<readonly string[]> {
  const recipientUserIds = new Set<string>();

  for (const target of input.targets) {
    if (target.targetType === "athlete") {
      if (target.athleteUserId) {
        recipientUserIds.add(target.athleteUserId);
      }
      continue;
    }

    if (!target.teamId) {
      continue;
    }

    const teamAthletes = await transaction.listAthleteUserIdsForTeam(
      input.organizationId,
      target.teamId,
    );

    for (const athleteUserId of teamAthletes) {
      recipientUserIds.add(athleteUserId);
    }
  }

  return [...recipientUserIds];
}

export async function createAssignment(
  unitOfWork: AssignmentUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    timezone: string;
    source: AssignmentSourceInput;
    targets: readonly AssignmentTargetInput[];
  },
): Promise<Assignment> {
  return unitOfWork.transaction(async (transaction) => {
    const access = await resolveActorAccess(transaction, input);

    await assertTargetsAllowedForTeamManagerScope(transaction, {
      organizationId: input.organizationId,
      targets: input.targets,
      canAssignOrganization: access.canAssignOrganization,
      managedTeamIds: access.managedTeamIds,
    });

    const assignment = await transaction.createAssignmentDraft(input);
    await transaction.replaceAssignmentTargets(
      input.organizationId,
      assignment.id,
      input.targets,
    );

    return assignment;
  });
}

export async function updateAssignment(
  unitOfWork: AssignmentUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    assignmentId: string;
    expectedVersion: number;
    timezone: string;
    source: AssignmentSourceInput;
    targets: readonly AssignmentTargetInput[];
  },
): Promise<Assignment> {
  return unitOfWork.transaction(async (transaction) => {
    const access = await resolveActorAccess(transaction, input);

    const current = await transaction.findAssignment(
      input.organizationId,
      input.assignmentId,
    );

    if (!current) {
      throw new ResourceNotFoundError("Assignment");
    }

    assertDraft(current);
    assertVersion(current.version, input.expectedVersion);

    await assertTargetsAllowedForTeamManagerScope(transaction, {
      organizationId: input.organizationId,
      targets: input.targets,
      canAssignOrganization: access.canAssignOrganization,
      managedTeamIds: access.managedTeamIds,
    });

    const updated = await transaction.updateAssignmentDraft(input);

    if (!updated) {
      throw new DomainInvariantError(
        "This assignment was updated by someone else. Reload and try again.",
      );
    }

    await transaction.replaceAssignmentTargets(
      input.organizationId,
      input.assignmentId,
      input.targets,
    );

    return updated;
  });
}

export async function publishAssignment(
  unitOfWork: AssignmentUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    assignmentId: string;
    expectedVersion: number;
  },
): Promise<Assignment> {
  return unitOfWork.transaction(async (transaction) => {
    const access = await resolveActorAccess(transaction, input);

    const current = await transaction.findAssignment(
      input.organizationId,
      input.assignmentId,
    );

    if (!current) {
      throw new ResourceNotFoundError("Assignment");
    }

    assertDraft(current, "Only draft assignments can be published.");
    assertVersion(current.version, input.expectedVersion);

    const source: AssignmentSourceInput =
      current.sourcePlanId !== null
        ? {
            sourceType: "plan",
            sourcePlanId: current.sourcePlanId,
            startDate: current.startDate!,
            endDate: current.endDate!,
          }
        : {
            sourceType: "workout",
            sourceWorkoutId: current.sourceWorkoutId!,
            scheduledDate: current.scheduledDate!,
            availableFrom: current.availableFrom?.toISOString() ?? null,
            availableUntil: current.availableUntil?.toISOString() ?? null,
          };

    await assertSourceIsActive(transaction, {
      organizationId: input.organizationId,
      source,
    });

    const targets = await transaction.listAssignmentTargets(
      input.organizationId,
      input.assignmentId,
    );

    await assertTargetsAllowedForTeamManagerScope(transaction, {
      organizationId: input.organizationId,
      targets: targets.map((target) =>
        target.targetType === "team"
          ? { targetType: "team" as const, teamId: target.teamId! }
          : {
              targetType: "athlete" as const,
              athleteUserId: target.athleteUserId!,
            },
      ),
      canAssignOrganization: access.canAssignOrganization,
      managedTeamIds: access.managedTeamIds,
    });

    const recipientUserIds = await resolveRecipientUserIds(transaction, {
      organizationId: input.organizationId,
      targets,
    });

    if (recipientUserIds.length === 0) {
      throw new DomainInvariantError(
        "Add at least one eligible athlete before publishing.",
      );
    }

    await transaction.replaceAssignmentRecipients(
      input.organizationId,
      input.assignmentId,
      recipientUserIds,
    );

    const snapshotCount = await transaction.snapshotAssignmentSource(
      input.organizationId,
      input.assignmentId,
      source,
    );

    if (snapshotCount === 0) {
      throw new DomainInvariantError(
        "Assignment source must contain at least one workout.",
      );
    }

    const published = await transaction.markAssignmentPublished(input);

    if (!published) {
      throw new DomainInvariantError(
        "This assignment was updated by someone else. Reload and try again.",
      );
    }

    return published;
  });
}

export async function cancelAssignment(
  unitOfWork: AssignmentUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    assignmentId: string;
    expectedVersion: number;
  },
): Promise<Assignment> {
  return unitOfWork.transaction(async (transaction) => {
    const access = await resolveActorAccess(transaction, input);

    const current = await transaction.findAssignment(
      input.organizationId,
      input.assignmentId,
    );

    if (!current) {
      throw new ResourceNotFoundError("Assignment");
    }

    if (current.status === "canceled") {
      throw new DomainInvariantError("Assignment is already canceled.");
    }

    assertVersion(current.version, input.expectedVersion);

    const targets = await transaction.listAssignmentTargets(
      input.organizationId,
      input.assignmentId,
    );

    await assertTargetsAllowedForTeamManagerScope(transaction, {
      organizationId: input.organizationId,
      targets: targets.map((target) =>
        target.targetType === "team"
          ? { targetType: "team" as const, teamId: target.teamId! }
          : {
              targetType: "athlete" as const,
              athleteUserId: target.athleteUserId!,
            },
      ),
      canAssignOrganization: access.canAssignOrganization,
      managedTeamIds: access.managedTeamIds,
    });

    const canceled = await transaction.markAssignmentCanceled(input);

    if (!canceled) {
      throw new DomainInvariantError(
        "This assignment was updated by someone else. Reload and try again.",
      );
    }

    return canceled;
  });
}
