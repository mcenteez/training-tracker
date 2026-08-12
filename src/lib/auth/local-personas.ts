import "server-only";

export const localAuthCookieName = "training_tracker_local_persona";

export const localPersonas = {
  owner: {
    externalId: "local:owner",
    email: "owner@local.test",
    fullName: "Local Owner",
    label: "Organization Owner",
  },
  manager: {
    externalId: "local:manager",
    email: "manager@local.test",
    fullName: "Local Team Manager",
    label: "Basketball Team Manager",
  },
  athlete: {
    externalId: "local:athlete",
    email: "athlete@local.test",
    fullName: "Local Athlete",
    label: "Basketball Athlete",
  },
  viewer: {
    externalId: "local:viewer",
    email: "viewer@local.test",
    fullName: "Local Viewer",
    label: "Organization Viewer",
  },
} as const;

export type LocalPersonaKey = keyof typeof localPersonas;

export function isLocalPersonaKey(value: string): value is LocalPersonaKey {
  return Object.hasOwn(localPersonas, value);
}
