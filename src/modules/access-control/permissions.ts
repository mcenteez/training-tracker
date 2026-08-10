import type { OrganizationRole, TeamRole } from "./roles";

export const permissions = [
  "organization.read",
  "organization.update",
  "organization.delete",
  "organization.members.manage",
  "organization.ownership.transfer",
  "team.read",
  "team.create",
  "team.update",
  "team.delete",
  "team.members.manage",
  "workout.read",
  "workout.manage",
  "workout.assign.organization",
  "workout.assign.team",
  "results.read.all",
  "results.read.own",
  "results.write.own",
] as const;

export type Permission = (typeof permissions)[number];

const organizationPermissions: Record<OrganizationRole, readonly Permission[]> =
  {
    owner: permissions,
    manager: [
      "organization.read",
      "organization.update",
      "organization.members.manage",
      "team.read",
      "team.create",
      "team.update",
      "team.delete",
      "team.members.manage",
      "workout.read",
      "workout.manage",
      "workout.assign.organization",
      "workout.assign.team",
      "results.read.all",
    ],
    viewer: [
      "organization.read",
      "team.read",
      "workout.read",
      "results.read.all",
    ],
    athlete: [
      "organization.read",
      "workout.read",
      "results.read.own",
      "results.write.own",
    ],
  };

const teamPermissions: Record<TeamRole, readonly Permission[]> = {
  manager: [
    "team.read",
    "team.update",
    "team.members.manage",
    "workout.read",
    "workout.manage",
    "workout.assign.team",
    "results.read.all",
  ],
  viewer: ["team.read", "workout.read", "results.read.all"],
  athlete: [
    "team.read",
    "workout.read",
    "results.read.own",
    "results.write.own",
  ],
};

export interface AccessContext {
  organizationRole: OrganizationRole;
  teamRole?: TeamRole | null;
}

export function hasPermission(
  context: AccessContext,
  permission: Permission,
): boolean {
  return (
    organizationPermissions[context.organizationRole].includes(permission) ||
    (context.teamRole !== null &&
      context.teamRole !== undefined &&
      teamPermissions[context.teamRole].includes(permission))
  );
}

export function canManageOrganizationMember(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
): boolean {
  return (
    (actorRole === "owner" || actorRole === "manager") && targetRole !== "owner"
  );
}

export function canManageTeamMember(actor: AccessContext): boolean {
  return hasPermission(actor, "team.members.manage");
}
