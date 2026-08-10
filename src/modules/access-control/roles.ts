export const organizationRoles = [
  "owner",
  "manager",
  "viewer",
  "athlete",
] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

export const teamRoles = ["manager", "viewer", "athlete"] as const;

export type TeamRole = (typeof teamRoles)[number];
