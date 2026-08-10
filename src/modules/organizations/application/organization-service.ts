import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  canManageOrganizationMember,
  hasPermission,
} from "@/modules/access-control/permissions";
import type { OrganizationRole } from "@/modules/access-control/roles";

export interface OrganizationRecord {
  id: string;
  name: string;
}

export interface OrganizationTransaction {
  createOrganization(name: string): Promise<OrganizationRecord>;
  addMembership(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<void>;
  findMembershipRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  updateMembershipRole(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<void>;
  deleteMembership(organizationId: string, userId: string): Promise<void>;
}

export interface OrganizationUnitOfWork {
  transaction<Result>(
    operation: (transaction: OrganizationTransaction) => Promise<Result>,
  ): Promise<Result>;
}

export async function createOrganizationWithOwner(
  unitOfWork: OrganizationUnitOfWork,
  input: { name: string; ownerUserId: string },
): Promise<OrganizationRecord> {
  return unitOfWork.transaction(async (transaction) => {
    const organization = await transaction.createOrganization(input.name);
    await transaction.addMembership(
      organization.id,
      input.ownerUserId,
      "owner",
    );
    return organization;
  });
}

export async function transferOrganizationOwnership(
  unitOfWork: OrganizationUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    newOwnerUserId: string;
    previousOwnerRole: Exclude<OrganizationRole, "owner">;
  },
): Promise<void> {
  if (input.actorUserId === input.newOwnerUserId) {
    throw new DomainInvariantError("The new Owner must be a different user");
  }

  await unitOfWork.transaction(async (transaction) => {
    const actorRole = await transaction.findMembershipRole(
      input.organizationId,
      input.actorUserId,
    );

    if (
      actorRole === null ||
      !hasPermission(
        { organizationRole: actorRole },
        "organization.ownership.transfer",
      )
    ) {
      throw new AuthorizationError();
    }

    const newOwnerRole = await transaction.findMembershipRole(
      input.organizationId,
      input.newOwnerUserId,
    );

    if (newOwnerRole === null) {
      throw new ResourceNotFoundError("New Owner membership");
    }

    await transaction.updateMembershipRole(
      input.organizationId,
      input.actorUserId,
      input.previousOwnerRole,
    );
    await transaction.updateMembershipRole(
      input.organizationId,
      input.newOwnerUserId,
      "owner",
    );
  });
}

export async function removeOrganizationMember(
  unitOfWork: OrganizationUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
  },
): Promise<void> {
  await unitOfWork.transaction(async (transaction) => {
    const actorRole = await transaction.findMembershipRole(
      input.organizationId,
      input.actorUserId,
    );
    const targetRole = await transaction.findMembershipRole(
      input.organizationId,
      input.targetUserId,
    );

    if (
      actorRole === null ||
      targetRole === null ||
      !canManageOrganizationMember(actorRole, targetRole)
    ) {
      throw new AuthorizationError();
    }

    await transaction.deleteMembership(
      input.organizationId,
      input.targetUserId,
    );
  });
}
