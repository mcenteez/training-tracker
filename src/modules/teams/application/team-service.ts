import {
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

export interface TeamRecord {
  id: string;
  organizationId: string;
  name: string;
}

export interface TeamAuditEventInput {
  organizationId: string;
  actorUserId: string;
  targetUserId?: string | null;
  action:
    | "team.created"
    | "team.updated"
    | "team.member.upserted"
    | "team.member.removed";
  details: { teamId: string; role?: TeamRole };
}

export interface TeamTransaction {
  createTeam(organizationId: string, name: string): Promise<TeamRecord>;
  updateTeam(
    organizationId: string,
    teamId: string,
    name: string,
  ): Promise<TeamRecord | null>;
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
  addOrganizationAthlete(organizationId: string, userId: string): Promise<void>;
  upsertTeamMembership(
    organizationId: string,
    teamId: string,
    userId: string,
    role: TeamRole,
  ): Promise<void>;
  deleteTeamMembership(
    organizationId: string,
    teamId: string,
    userId: string,
  ): Promise<void>;
  recordAuditEvent(event: TeamAuditEventInput): Promise<void>;
}

export interface TeamUnitOfWork {
  transaction<Result>(
    operation: (transaction: TeamTransaction) => Promise<Result>,
  ): Promise<Result>;
}

export async function createTeam(
  unitOfWork: TeamUnitOfWork,
  input: { organizationId: string; actorUserId: string; name: string },
): Promise<TeamRecord> {
  return unitOfWork.transaction(async (transaction) => {
    const organizationRole = requireOrganizationRoleAtLeast(
      await transaction.findOrganizationRole(
        input.organizationId,
        input.actorUserId,
      ),
      "athlete",
    );

    requireTeamAccess({ organizationRole }, "team.create");

    const team = await transaction.createTeam(input.organizationId, input.name);
    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "team.created",
      details: { teamId: team.id },
    });
    return team;
  });
}

export async function updateTeam(
  unitOfWork: TeamUnitOfWork,
  input: {
    organizationId: string;
    teamId: string;
    actorUserId: string;
    name: string;
  },
): Promise<TeamRecord> {
  return unitOfWork.transaction(async (transaction) => {
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

    requireTeamAccess({ organizationRole, teamRole }, "team.update");

    const team = await transaction.updateTeam(
      input.organizationId,
      input.teamId,
      input.name,
    );

    if (!team) {
      throw new ResourceNotFoundError("Team");
    }

    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "team.updated",
      details: { teamId: team.id },
    });

    return team;
  });
}

export async function addOrUpdateTeamMember(
  unitOfWork: TeamUnitOfWork,
  input: {
    organizationId: string;
    teamId: string;
    actorUserId: string;
    targetUserId: string;
    role: TeamRole;
  },
): Promise<void> {
  await unitOfWork.transaction(async (transaction) => {
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

    if (
      input.actorUserId === input.targetUserId &&
      teamRole === "manager" &&
      organizationRole !== "owner" &&
      organizationRole !== "manager" &&
      input.role !== "manager"
    ) {
      throw new DomainInvariantError(
        "Team Managers cannot demote themselves from a managed team.",
      );
    }

    const targetOrganizationRole = await transaction.findOrganizationRole(
      input.organizationId,
      input.targetUserId,
    );

    if (targetOrganizationRole === null) {
      await transaction.addOrganizationAthlete(
        input.organizationId,
        input.targetUserId,
      );
    }

    await transaction.upsertTeamMembership(
      input.organizationId,
      input.teamId,
      input.targetUserId,
      input.role,
    );
    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      action: "team.member.upserted",
      details: { teamId: input.teamId, role: input.role },
    });
  });
}

export async function removeTeamMember(
  unitOfWork: TeamUnitOfWork,
  input: {
    organizationId: string;
    teamId: string;
    actorUserId: string;
    targetUserId: string;
  },
): Promise<void> {
  await unitOfWork.transaction(async (transaction) => {
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

    if (
      input.actorUserId === input.targetUserId &&
      teamRole === "manager" &&
      organizationRole !== "owner" &&
      organizationRole !== "manager"
    ) {
      throw new DomainInvariantError(
        "Team Managers cannot remove themselves from a managed team.",
      );
    }

    await transaction.deleteTeamMembership(
      input.organizationId,
      input.teamId,
      input.targetUserId,
    );
    await transaction.recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      action: "team.member.removed",
      details: { teamId: input.teamId },
    });
  });
}
