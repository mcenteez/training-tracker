import { randomUUID } from "node:crypto";

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

export type OrganizationInvitationStatus =
  "pending" | "accepted" | "revoked" | "expired";

export interface OrganizationInvitationRecord {
  id: string;
  organizationId: string;
  invitedEmail: string;
  role: OrganizationRole;
  status: OrganizationInvitationStatus;
  token: string;
  expiresAt: Date;
  createdByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export interface OrganizationAuditEventInput {
  organizationId: string;
  actorUserId: string;
  targetUserId?: string | null;
  action:
    | "organization.ownership.transferred"
    | "organization.member.removed"
    | "organization.member.role_updated"
    | "organization.timezone.updated"
    | "organization.invite.created"
    | "organization.invite.revoked"
    | "organization.invite.accepted";
  details?: Record<string, unknown>;
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
  upsertMembershipRole(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<void>;
  deleteMembership(organizationId: string, userId: string): Promise<void>;
  updateOrganizationTimezone(
    organizationId: string,
    timezone: string,
  ): Promise<void>;
  findPendingInvitationByEmail(
    organizationId: string,
    invitedEmail: string,
  ): Promise<OrganizationInvitationRecord | null>;
  createInvitation(input: {
    organizationId: string;
    invitedEmail: string;
    role: Exclude<OrganizationRole, "owner">;
    token: string;
    expiresAt: Date;
    createdByUserId: string;
  }): Promise<OrganizationInvitationRecord>;
  findInvitationById(
    organizationId: string,
    invitationId: string,
  ): Promise<OrganizationInvitationRecord | null>;
  findInvitationByToken(
    token: string,
  ): Promise<OrganizationInvitationRecord | null>;
  markInvitationRevoked(invitationId: string, revokedAt: Date): Promise<void>;
  markInvitationExpired(invitationId: string, expiredAt: Date): Promise<void>;
  markInvitationAccepted(input: {
    invitationId: string;
    acceptedByUserId: string;
    acceptedAt: Date;
  }): Promise<void>;
  recordAuditEvent(event: OrganizationAuditEventInput): Promise<void>;
}

export interface OrganizationUnitOfWork {
  transaction<Result>(
    operation: (transaction: OrganizationTransaction) => Promise<Result>,
  ): Promise<Result>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeTimezone(timezone: string): string {
  const normalizedTimezone = timezone.trim();

  if (normalizedTimezone.length === 0) {
    throw new DomainInvariantError("Timezone is required");
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalizedTimezone });
  } catch {
    throw new DomainInvariantError("Timezone must be a valid IANA timezone");
  }

  return normalizedTimezone;
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
    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      targetUserId: input.newOwnerUserId,
      action: "organization.ownership.transferred",
      details: {
        previousOwnerRole: input.previousOwnerRole,
      },
    });
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
    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      action: "organization.member.removed",
    });
  });
}

export async function updateOrganizationMembershipRole(
  unitOfWork: OrganizationUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
    role: Exclude<OrganizationRole, "owner">;
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

    await transaction.updateMembershipRole(
      input.organizationId,
      input.targetUserId,
      input.role,
    );
    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      action: "organization.member.role_updated",
      details: {
        role: input.role,
      },
    });
  });
}

export async function updateOrganizationTimezone(
  unitOfWork: OrganizationUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    timezone: string;
  },
): Promise<void> {
  const timezone = normalizeTimezone(input.timezone);

  await unitOfWork.transaction(async (transaction) => {
    const actorRole = await transaction.findMembershipRole(
      input.organizationId,
      input.actorUserId,
    );

    if (
      actorRole === null ||
      !hasPermission({ organizationRole: actorRole }, "organization.update")
    ) {
      throw new AuthorizationError();
    }

    await transaction.updateOrganizationTimezone(
      input.organizationId,
      timezone,
    );
    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "organization.timezone.updated",
      details: { timezone },
    });
  });
}

export async function createOrganizationInvitation(
  unitOfWork: OrganizationUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    invitedEmail: string;
    invitedRole: Exclude<OrganizationRole, "owner">;
    expiresAt: Date;
    token?: string;
  },
): Promise<OrganizationInvitationRecord> {
  return unitOfWork.transaction(async (transaction) => {
    const actorRole = await transaction.findMembershipRole(
      input.organizationId,
      input.actorUserId,
    );

    if (
      actorRole === null ||
      !hasPermission(
        { organizationRole: actorRole },
        "organization.members.manage",
      )
    ) {
      throw new AuthorizationError();
    }

    const invitedEmail = normalizeEmail(input.invitedEmail);
    const existingPendingInvitation =
      await transaction.findPendingInvitationByEmail(
        input.organizationId,
        invitedEmail,
      );

    if (existingPendingInvitation !== null) {
      throw new DomainInvariantError(
        "A pending invitation already exists for this email",
      );
    }

    const invitation = await transaction.createInvitation({
      organizationId: input.organizationId,
      invitedEmail,
      role: input.invitedRole,
      token: input.token ?? randomUUID(),
      expiresAt: input.expiresAt,
      createdByUserId: input.actorUserId,
    });

    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "organization.invite.created",
      details: {
        invitationId: invitation.id,
        invitedEmail: invitation.invitedEmail,
        role: invitation.role,
      },
    });

    return invitation;
  });
}

export async function revokeOrganizationInvitation(
  unitOfWork: OrganizationUnitOfWork,
  input: {
    organizationId: string;
    actorUserId: string;
    invitationId: string;
  },
): Promise<void> {
  await unitOfWork.transaction(async (transaction) => {
    const actorRole = await transaction.findMembershipRole(
      input.organizationId,
      input.actorUserId,
    );

    if (
      actorRole === null ||
      !hasPermission(
        { organizationRole: actorRole },
        "organization.members.manage",
      )
    ) {
      throw new AuthorizationError();
    }

    const invitation = await transaction.findInvitationById(
      input.organizationId,
      input.invitationId,
    );

    if (invitation === null) {
      throw new ResourceNotFoundError("Organization invitation");
    }

    if (invitation.status !== "pending") {
      throw new DomainInvariantError("Only pending invitations can be revoked");
    }

    await transaction.markInvitationRevoked(invitation.id, new Date());
    await transaction.recordAuditEvent({
      organizationId: invitation.organizationId,
      actorUserId: input.actorUserId,
      action: "organization.invite.revoked",
      details: {
        invitationId: invitation.id,
        invitedEmail: invitation.invitedEmail,
      },
    });
  });
}

export async function acceptOrganizationInvitation(
  unitOfWork: OrganizationUnitOfWork,
  input: {
    actorUserId: string;
    actorEmail: string;
    invitationToken: string;
  },
): Promise<{ organizationId: string; role: OrganizationRole }> {
  return unitOfWork.transaction(async (transaction) => {
    const invitation = await transaction.findInvitationByToken(
      input.invitationToken,
    );

    if (invitation === null) {
      throw new ResourceNotFoundError("Organization invitation");
    }

    if (invitation.status !== "pending") {
      throw new DomainInvariantError("Invitation is no longer pending");
    }

    const now = new Date();

    if (invitation.expiresAt.getTime() <= now.getTime()) {
      await transaction.markInvitationExpired(invitation.id, now);
      throw new DomainInvariantError("Invitation has expired");
    }

    const actorEmail = normalizeEmail(input.actorEmail);

    if (actorEmail !== normalizeEmail(invitation.invitedEmail)) {
      throw new AuthorizationError();
    }

    await transaction.upsertMembershipRole(
      invitation.organizationId,
      input.actorUserId,
      invitation.role,
    );
    await transaction.markInvitationAccepted({
      invitationId: invitation.id,
      acceptedByUserId: input.actorUserId,
      acceptedAt: now,
    });
    await transaction.recordAuditEvent({
      organizationId: invitation.organizationId,
      actorUserId: input.actorUserId,
      targetUserId: input.actorUserId,
      action: "organization.invite.accepted",
      details: {
        invitationId: invitation.id,
        role: invitation.role,
      },
    });

    return {
      organizationId: invitation.organizationId,
      role: invitation.role,
    };
  });
}
