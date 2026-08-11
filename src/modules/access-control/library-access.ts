import { hasPermission } from "./permissions";
import type { OrganizationRole, TeamRole } from "./roles";

export type LibraryAccess = "none" | "read" | "manage";

export function resolveLibraryAccess(input: {
  organizationRole: OrganizationRole;
  teamRoles: readonly TeamRole[];
}): LibraryAccess {
  const contexts = [
    { organizationRole: input.organizationRole },
    ...input.teamRoles.map((teamRole) => ({
      organizationRole: input.organizationRole,
      teamRole,
    })),
  ];

  if (
    contexts.some(
      (context) =>
        hasPermission(context, "exercise.library.manage") &&
        hasPermission(context, "workout.library.manage"),
    )
  ) {
    return "manage";
  }

  if (
    contexts.some(
      (context) =>
        hasPermission(context, "exercise.library.read") &&
        hasPermission(context, "workout.library.read"),
    )
  ) {
    return "read";
  }

  return "none";
}
