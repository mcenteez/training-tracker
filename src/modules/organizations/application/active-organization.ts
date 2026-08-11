import type { Database } from "@/db/client";
import {
  resolveOrganizationSelection,
  type LandingDestination,
} from "@/modules/access-control/landing";
import {
  listOrganizationMembershipsForUser,
  type UserOrganizationMembershipListItem,
} from "@/modules/organizations/db/queries";

export const activeOrganizationCookieName = "training_tracker_active_org";

export type ActiveOrganizationResolution =
  | {
      kind: "active-organization";
      membership: UserOrganizationMembershipListItem;
      memberships: UserOrganizationMembershipListItem[];
    }
  | {
      kind: Extract<
        LandingDestination["kind"],
        "onboarding" | "organization-chooser"
      >;
      memberships: UserOrganizationMembershipListItem[];
    };

export async function resolveActiveOrganization(
  database: Database,
  input: { userId: string; preferredOrganizationId: string | null },
): Promise<ActiveOrganizationResolution> {
  const memberships = await listOrganizationMembershipsForUser(
    database,
    input.userId,
  );
  const selection = resolveOrganizationSelection({
    organizationIds: memberships.map((membership) => membership.organizationId),
    preferredOrganizationId: input.preferredOrganizationId,
  });

  if (selection.kind !== "active-organization") {
    return { kind: selection.kind, memberships };
  }

  const membership = memberships.find(
    (candidate) => candidate.organizationId === selection.organizationId,
  );

  if (!membership) {
    return { kind: "organization-chooser", memberships };
  }

  return { kind: "active-organization", membership, memberships };
}
