import { AuthorizationError } from "@/modules/access-control/errors";
import {
  hasPermission,
  type AccessContext,
  type Permission,
} from "@/modules/access-control/permissions";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";

const organizationRoleWeight: Record<OrganizationRole, number> = {
  owner: 4,
  manager: 3,
  viewer: 2,
  athlete: 1,
};

const teamRoleWeight: Record<TeamRole, number> = {
  manager: 3,
  viewer: 2,
  athlete: 1,
};

export function requireAuthenticatedUser(
  userId: string | null | undefined,
): string {
  if (!userId) {
    throw new AuthorizationError();
  }

  return userId;
}

export function requireOrganizationAccess(context: {
  organizationId: string | null;
}): string {
  if (!context.organizationId) {
    throw new AuthorizationError();
  }

  return context.organizationId;
}

export function requireOrganizationRoleAtLeast(
  organizationRole: OrganizationRole | null,
  minimumRole: OrganizationRole,
): OrganizationRole {
  if (!organizationRole) {
    throw new AuthorizationError();
  }

  if (
    organizationRoleWeight[organizationRole] <
    organizationRoleWeight[minimumRole]
  ) {
    throw new AuthorizationError();
  }

  return organizationRole;
}

export function requireTeamRoleAtLeast(
  teamRole: TeamRole | null | undefined,
  minimumRole: TeamRole,
): TeamRole {
  if (!teamRole) {
    throw new AuthorizationError();
  }

  if (teamRoleWeight[teamRole] < teamRoleWeight[minimumRole]) {
    throw new AuthorizationError();
  }

  return teamRole;
}

export function requireTeamAccess(
  context: AccessContext,
  permission: Permission,
): void {
  if (!hasPermission(context, permission)) {
    throw new AuthorizationError();
  }
}
