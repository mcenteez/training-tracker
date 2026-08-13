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
import type { PrescriptionOverrideField } from "./effective-prescription";

export interface AthletePrescriptionOverrideInput {
  organizationId: string;
  actorUserId: string;
  assignmentId: string;
  recipientId: string;
  athleteUserId: string;
  itemSnapshotId: string;
  planSlotSnapshotId: string | null;
  expectedVersion: number | null;
  overriddenFields: readonly PrescriptionOverrideField[];
  reps: number | null;
  load: string | null;
  loadValue: string | null;
  loadUnit: "kg" | "lb" | null;
  normalizedLoadKg: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
  reason: string | null;
}

interface OverrideTarget {
  assignmentStatus: "published" | "canceled" | "draft";
  recipientId: string;
  athleteUserId: string;
}

interface ExistingOverride {
  id: string;
  version: number;
}

export interface AthletePrescriptionTransaction {
  findOrganizationRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  listTeamRoles(
    organizationId: string,
    userId: string,
  ): Promise<readonly { teamId: string; role: TeamRole }[]>;
  findOverrideTarget(input: {
    organizationId: string;
    assignmentId: string;
    recipientId: string;
    athleteUserId: string;
    itemSnapshotId: string;
    planSlotSnapshotId: string | null;
  }): Promise<OverrideTarget | null>;
  recipientHasManagedTeamScope(input: {
    organizationId: string;
    assignmentId: string;
    recipientId: string;
    managedTeamIds: readonly string[];
  }): Promise<boolean>;
  findOverride(input: {
    organizationId: string;
    assignmentId: string;
    recipientId: string;
    itemSnapshotId: string;
    planSlotSnapshotId: string | null;
  }): Promise<ExistingOverride | null>;
  hasLockedSession(input: {
    organizationId: string;
    assignmentId: string;
    recipientId: string;
    athleteUserId: string;
    itemSnapshotId: string;
    planSlotSnapshotId: string | null;
  }): Promise<boolean>;
  createOverride(
    input: AthletePrescriptionOverrideInput,
  ): Promise<{ id: string; version: number }>;
  updateOverride(
    input: AthletePrescriptionOverrideInput & { overrideId: string },
  ): Promise<{ id: string; version: number } | null>;
  deleteOverride(input: {
    organizationId: string;
    assignmentId: string;
    overrideId: string;
    expectedVersion: number;
  }): Promise<boolean>;
}

export interface AthletePrescriptionUnitOfWork {
  transaction<Result>(
    operation: (transaction: AthletePrescriptionTransaction) => Promise<Result>,
  ): Promise<Result>;
}

async function assertActorCanManageTarget(
  transaction: AthletePrescriptionTransaction,
  input: AthletePrescriptionOverrideInput,
): Promise<void> {
  const organizationRole = await transaction.findOrganizationRole(
    input.organizationId,
    input.actorUserId,
  );

  if (!organizationRole) {
    throw new AuthorizationError();
  }

  if (hasPermission({ organizationRole }, "workout.assign.organization")) {
    return;
  }

  const managedTeamIds = (
    await transaction.listTeamRoles(input.organizationId, input.actorUserId)
  )
    .filter(
      (membership) =>
        membership.role === "manager" &&
        hasPermission(
          { organizationRole, teamRole: membership.role },
          "workout.assign.team",
        ),
    )
    .map((membership) => membership.teamId);

  if (
    managedTeamIds.length === 0 ||
    !(await transaction.recipientHasManagedTeamScope({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      recipientId: input.recipientId,
      managedTeamIds,
    }))
  ) {
    throw new AuthorizationError();
  }
}

function assertOverrideShape(input: AthletePrescriptionOverrideInput): void {
  if (input.overriddenFields.length === 0) {
    throw new DomainInvariantError("Choose at least one field to override.");
  }

  const uniqueFields = new Set(input.overriddenFields);
  if (uniqueFields.size !== input.overriddenFields.length) {
    throw new DomainInvariantError(
      "Duplicate override fields are not allowed.",
    );
  }
}

export async function saveAthletePrescriptionOverride(
  unitOfWork: AthletePrescriptionUnitOfWork,
  input: AthletePrescriptionOverrideInput,
): Promise<{ id: string; version: number }> {
  assertOverrideShape(input);

  return unitOfWork.transaction(async (transaction) => {
    await assertActorCanManageTarget(transaction, input);

    const target = await transaction.findOverrideTarget(input);
    if (!target) {
      throw new ResourceNotFoundError("Assignment workout item");
    }
    if (target.assignmentStatus !== "published") {
      throw new DomainInvariantError(
        "Only published assignments can have athlete prescriptions.",
      );
    }
    if (
      input.planSlotSnapshotId === null &&
      (await transaction.hasLockedSession(input))
    ) {
      throw new DomainInvariantError(
        "Started or completed sessions keep their original prescription.",
      );
    }

    const existing = await transaction.findOverride(input);
    if (!existing) {
      if (input.expectedVersion !== null) {
        throw new DomainInvariantError(
          "This prescription was updated elsewhere. Reload and try again.",
        );
      }
      return transaction.createOverride(input);
    }

    if (input.expectedVersion !== existing.version) {
      throw new DomainInvariantError(
        "This prescription was updated elsewhere. Reload and try again.",
      );
    }

    const updated = await transaction.updateOverride({
      ...input,
      overrideId: existing.id,
    });
    if (!updated) {
      throw new DomainInvariantError(
        "This prescription was updated elsewhere. Reload and try again.",
      );
    }

    return updated;
  });
}

export async function clearAthletePrescriptionOverride(
  unitOfWork: AthletePrescriptionUnitOfWork,
  input: Omit<
    AthletePrescriptionOverrideInput,
    | "overriddenFields"
    | "reps"
    | "load"
    | "loadValue"
    | "loadUnit"
    | "normalizedLoadKg"
    | "durationSeconds"
    | "distanceMeters"
    | "restSeconds"
    | "tempo"
    | "notes"
    | "reason"
  >,
): Promise<void> {
  if (input.expectedVersion === null) {
    throw new DomainInvariantError("A prescription version is required.");
  }

  return unitOfWork.transaction(async (transaction) => {
    const authorizationInput = {
      ...input,
      overriddenFields: ["reps"],
      reps: null,
      load: null,
      loadValue: null,
      loadUnit: null,
      normalizedLoadKg: null,
      durationSeconds: null,
      distanceMeters: null,
      restSeconds: null,
      tempo: null,
      notes: null,
      reason: null,
    } as const;
    await assertActorCanManageTarget(transaction, authorizationInput);
    if (
      input.planSlotSnapshotId === null &&
      (await transaction.hasLockedSession(authorizationInput))
    ) {
      throw new DomainInvariantError(
        "Started or completed sessions keep their original prescription.",
      );
    }
    const existing = await transaction.findOverride(input);
    if (!existing || existing.version !== input.expectedVersion) {
      throw new DomainInvariantError(
        "This prescription was updated elsewhere. Reload and try again.",
      );
    }

    const deleted = await transaction.deleteOverride({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      overrideId: existing.id,
      expectedVersion: input.expectedVersion,
    });
    if (!deleted) {
      throw new DomainInvariantError(
        "This prescription was updated elsewhere. Reload and try again.",
      );
    }
  });
}
