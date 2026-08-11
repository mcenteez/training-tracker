import { ResourceNotFoundError } from "@/modules/access-control/errors";
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

    return transaction.createTeam(input.organizationId, input.name);
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

    await transaction.deleteTeamMembership(
      input.organizationId,
      input.teamId,
      input.targetUserId,
    );
  });
}
