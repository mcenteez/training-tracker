import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  requireOrganizationRoleAtLeast,
  requireTeamAccess,
} from "@/modules/access-control/guards";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";

import {
  generateTeamInvitationToken,
  hashTeamInvitationToken,
} from "./team-invitation-token";

export type TeamInvitationStatus =
  "pending" | "accepted" | "revoked" | "expired";

export interface TeamInvitationRecord {
  id: string;
  organizationId: string;
  teamId: string;
  invitedEmail: string;
  role: TeamRole;
  status: TeamInvitationStatus;
  tokenHash: string;
  expiresAt: Date;
  createdByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export interface TeamInvitationAuditEventInput {
  organizationId: string;
  actorUserId: string;
  targetUserId?: string | null;
  action:
    "team.invite.created" | "team.invite.revoked" | "team.invite.accepted";
  details: { invitationId: string; teamId: string; role?: TeamRole };
}

export interface TeamInvitationTransaction {
  teamExists(organizationId: string, teamId: string): Promise<boolean>;
  findOrganizationRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null>;
  findTeamRole(
    organizationId: string,
    teamId: string,
    userId: string,
  ): Promise<TeamRole | null>;
  findPendingInvitationByEmail(
    organizationId: string,
    teamId: string,
    invitedEmail: string,
  ): Promise<TeamInvitationRecord | null>;
  createInvitation(input: {
    organizationId: string;
    teamId: string;
    invitedEmail: string;
    role: TeamRole;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: string;
  }): Promise<TeamInvitationRecord>;
  findInvitationById(
    organizationId: string,
    teamId: string,
    invitationId: string,
  ): Promise<TeamInvitationRecord | null>;
  findInvitationByTokenHashForUpdate(
    tokenHash: string,
  ): Promise<TeamInvitationRecord | null>;
  markInvitationRevoked(invitationId: string, revokedAt: Date): Promise<void>;
  markInvitationExpired(invitationId: string, expiredAt: Date): Promise<void>;
  markInvitationAccepted(input: {
    invitationId: string;
    acceptedByUserId: string;
    acceptedAt: Date;
  }): Promise<boolean>;
  addOrganizationAthlete(organizationId: string, userId: string): Promise<void>;
  upsertTeamMembership(
    organizationId: string,
    teamId: string,
    userId: string,
    role: TeamRole,
  ): Promise<void>;
  recordAuditEvent(event: TeamInvitationAuditEventInput): Promise<void>;
}

export interface TeamInvitationUnitOfWork {
  transaction<Result>(
    operation: (transaction: TeamInvitationTransaction) => Promise<Result>,
  ): Promise<Result>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function requireInvitationManagement(
  transaction: TeamInvitationTransaction,
  input: { organizationId: string; teamId: string; actorUserId: string },
): Promise<void> {
  const organizationRole = requireOrganizationRoleAtLeast(
    await transaction.findOrganizationRole(
      input.organizationId,
      input.actorUserId,
    ),
    "athlete",
  );

  if (!(await transaction.teamExists(input.organizationId, input.teamId))) {
    throw new ResourceNotFoundError("Team");
  }

  const teamRole = await transaction.findTeamRole(
    input.organizationId,
    input.teamId,
    input.actorUserId,
  );
  requireTeamAccess({ organizationRole, teamRole }, "team.members.manage");
}

export async function createTeamInvitation(
  unitOfWork: TeamInvitationUnitOfWork,
  input: {
    organizationId: string;
    teamId: string;
    actorUserId: string;
    invitedEmail: string;
    role: TeamRole;
    expiresAt: Date;
    token?: string;
    now?: Date;
  },
): Promise<{ invitation: TeamInvitationRecord; token: string }> {
  const now = input.now ?? new Date();

  if (input.expiresAt.getTime() <= now.getTime()) {
    throw new DomainInvariantError(
      "Invitation expiration must be in the future",
    );
  }

  return unitOfWork.transaction(async (transaction) => {
    await requireInvitationManagement(transaction, input);

    const invitedEmail = normalizeEmail(input.invitedEmail);
    const existingInvitation = await transaction.findPendingInvitationByEmail(
      input.organizationId,
      input.teamId,
      invitedEmail,
    );

    if (existingInvitation) {
      if (existingInvitation.expiresAt.getTime() > now.getTime()) {
        throw new DomainInvariantError(
          "A pending invitation already exists for this team and email",
        );
      }

      await transaction.markInvitationExpired(existingInvitation.id, now);
    }

    const token = input.token ?? generateTeamInvitationToken();
    const invitation = await transaction.createInvitation({
      organizationId: input.organizationId,
      teamId: input.teamId,
      invitedEmail,
      role: input.role,
      tokenHash: hashTeamInvitationToken(token),
      expiresAt: input.expiresAt,
      createdByUserId: input.actorUserId,
    });

    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "team.invite.created",
      details: {
        invitationId: invitation.id,
        teamId: input.teamId,
        role: input.role,
      },
    });

    return { invitation, token };
  });
}

export async function revokeTeamInvitation(
  unitOfWork: TeamInvitationUnitOfWork,
  input: {
    organizationId: string;
    teamId: string;
    actorUserId: string;
    invitationId: string;
    now?: Date;
  },
): Promise<void> {
  await unitOfWork.transaction(async (transaction) => {
    await requireInvitationManagement(transaction, input);
    const invitation = await transaction.findInvitationById(
      input.organizationId,
      input.teamId,
      input.invitationId,
    );

    if (!invitation) {
      throw new ResourceNotFoundError("Team invitation");
    }

    if (invitation.status !== "pending") {
      throw new DomainInvariantError("Only pending invitations can be revoked");
    }

    const now = input.now ?? new Date();
    await transaction.markInvitationRevoked(invitation.id, now);
    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "team.invite.revoked",
      details: { invitationId: invitation.id, teamId: input.teamId },
    });
  });
}

export async function acceptTeamInvitation(
  unitOfWork: TeamInvitationUnitOfWork,
  input: {
    actorUserId: string;
    actorEmail: string;
    token: string;
    now?: Date;
  },
): Promise<{ organizationId: string; teamId: string; role: TeamRole }> {
  const now = input.now ?? new Date();
  const outcome = await unitOfWork.transaction(async (transaction) => {
    const invitation = await transaction.findInvitationByTokenHashForUpdate(
      hashTeamInvitationToken(input.token),
    );

    if (!invitation) {
      throw new ResourceNotFoundError("Team invitation");
    }

    if (invitation.status !== "pending") {
      throw new DomainInvariantError("Invitation is no longer pending");
    }

    if (invitation.expiresAt.getTime() <= now.getTime()) {
      await transaction.markInvitationExpired(invitation.id, now);
      return { kind: "expired" as const };
    }

    if (normalizeEmail(input.actorEmail) !== invitation.invitedEmail) {
      throw new AuthorizationError();
    }

    const existingOrganizationRole = await transaction.findOrganizationRole(
      invitation.organizationId,
      input.actorUserId,
    );

    if (!existingOrganizationRole) {
      await transaction.addOrganizationAthlete(
        invitation.organizationId,
        input.actorUserId,
      );
    }

    await transaction.upsertTeamMembership(
      invitation.organizationId,
      invitation.teamId,
      input.actorUserId,
      invitation.role,
    );

    const accepted = await transaction.markInvitationAccepted({
      invitationId: invitation.id,
      acceptedByUserId: input.actorUserId,
      acceptedAt: now,
    });

    if (!accepted) {
      throw new DomainInvariantError("Invitation is no longer pending");
    }

    await transaction.recordAuditEvent({
      organizationId: invitation.organizationId,
      actorUserId: input.actorUserId,
      targetUserId: input.actorUserId,
      action: "team.invite.accepted",
      details: {
        invitationId: invitation.id,
        teamId: invitation.teamId,
        role: invitation.role,
      },
    });

    return {
      kind: "accepted" as const,
      organizationId: invitation.organizationId,
      teamId: invitation.teamId,
      role: invitation.role,
    };
  });

  if (outcome.kind === "expired") {
    throw new DomainInvariantError("Invitation has expired");
  }

  return {
    organizationId: outcome.organizationId,
    teamId: outcome.teamId,
    role: outcome.role,
  };
}
