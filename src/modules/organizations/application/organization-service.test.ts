import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
} from "@/modules/access-control/errors";
import type { OrganizationRole } from "@/modules/access-control/roles";

import {
  acceptOrganizationInvitation,
  createOrganizationInvitation,
  createOrganizationWithOwner,
  removeOrganizationMember,
  revokeOrganizationInvitation,
  transferOrganizationOwnership,
  type OrganizationInvitationRecord,
  type OrganizationTransaction,
  type OrganizationUnitOfWork,
} from "./organization-service";

function createTestUnitOfWork(
  roles: Map<string, OrganizationRole> = new Map(),
) {
  const operations: string[] = [];
  const invitations = new Map<string, OrganizationInvitationRecord>();

  const getPendingInvitationByEmail = (
    organizationId: string,
    invitedEmail: string,
  ): OrganizationInvitationRecord | null => {
    for (const invitation of invitations.values()) {
      if (
        invitation.organizationId === organizationId &&
        invitation.invitedEmail === invitedEmail &&
        invitation.status === "pending"
      ) {
        return invitation;
      }
    }

    return null;
  };

  const transaction: OrganizationTransaction = {
    createOrganization: vi.fn(async (name) => {
      operations.push(`create:${name}`);
      return { id: "organization-1", name };
    }),
    addMembership: vi.fn(async (_organizationId, userId, role) => {
      operations.push(`add:${userId}:${role}`);
      roles.set(userId, role);
    }),
    findMembershipRole: vi.fn(async (_organizationId, userId) => {
      return roles.get(userId) ?? null;
    }),
    updateMembershipRole: vi.fn(async (_organizationId, userId, role) => {
      operations.push(`update:${userId}:${role}`);
      roles.set(userId, role);
    }),
    upsertMembershipRole: vi.fn(async (_organizationId, userId, role) => {
      operations.push(`upsert:${userId}:${role}`);
      roles.set(userId, role);
    }),
    deleteMembership: vi.fn(async (_organizationId, userId) => {
      operations.push(`delete:${userId}`);
      roles.delete(userId);
    }),
    findPendingInvitationByEmail: vi.fn(
      async (organizationId, invitedEmail) => {
        return getPendingInvitationByEmail(organizationId, invitedEmail);
      },
    ),
    createInvitation: vi.fn(async (input) => {
      const invitation: OrganizationInvitationRecord = {
        id: `invitation-${invitations.size + 1}`,
        organizationId: input.organizationId,
        invitedEmail: input.invitedEmail,
        role: input.role,
        status: "pending",
        token: input.token,
        expiresAt: input.expiresAt,
        createdByUserId: input.createdByUserId,
        acceptedByUserId: null,
        acceptedAt: null,
        revokedAt: null,
      };

      invitations.set(invitation.id, invitation);
      operations.push(`invite:${invitation.invitedEmail}:${invitation.role}`);

      return invitation;
    }),
    findInvitationById: vi.fn(async (organizationId, invitationId) => {
      const invitation = invitations.get(invitationId);

      if (!invitation || invitation.organizationId !== organizationId) {
        return null;
      }

      return invitation;
    }),
    findInvitationByToken: vi.fn(async (token) => {
      for (const invitation of invitations.values()) {
        if (invitation.token === token) {
          return invitation;
        }
      }

      return null;
    }),
    markInvitationRevoked: vi.fn(async (invitationId, revokedAt) => {
      const invitation = invitations.get(invitationId);

      if (!invitation) {
        return;
      }

      invitation.status = "revoked";
      invitation.revokedAt = revokedAt;
      operations.push(`revoke:${invitationId}`);
    }),
    markInvitationExpired: vi.fn(async (invitationId) => {
      const invitation = invitations.get(invitationId);

      if (!invitation) {
        return;
      }

      invitation.status = "expired";
      operations.push(`expire:${invitationId}`);
    }),
    markInvitationAccepted: vi.fn(async (input) => {
      const invitation = invitations.get(input.invitationId);

      if (!invitation) {
        return;
      }

      invitation.status = "accepted";
      invitation.acceptedByUserId = input.acceptedByUserId;
      invitation.acceptedAt = input.acceptedAt;
      operations.push(`accept:${input.invitationId}:${input.acceptedByUserId}`);
    }),
  };
  const unitOfWork: OrganizationUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };

  return { invitations, operations, roles, unitOfWork };
}

describe("organization service", () => {
  it("creates an organization and its Owner atomically", async () => {
    const testContext = createTestUnitOfWork();

    const organization = await createOrganizationWithOwner(
      testContext.unitOfWork,
      { name: "North High", ownerUserId: "owner-1" },
    );

    expect(organization).toEqual({
      id: "organization-1",
      name: "North High",
    });
    expect(testContext.operations).toEqual([
      "create:North High",
      "add:owner-1:owner",
    ]);
  });

  it("demotes the existing Owner before promoting the new Owner", async () => {
    const testContext = createTestUnitOfWork(
      new Map([
        ["owner-1", "owner"],
        ["manager-1", "manager"],
      ]),
    );

    await transferOrganizationOwnership(testContext.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "owner-1",
      newOwnerUserId: "manager-1",
      previousOwnerRole: "manager",
    });

    expect(testContext.operations).toEqual([
      "update:owner-1:manager",
      "update:manager-1:owner",
    ]);
    expect(testContext.roles.get("manager-1")).toBe("owner");
  });

  it("rejects ownership transfer by a Manager", async () => {
    const testContext = createTestUnitOfWork(
      new Map([
        ["manager-1", "manager"],
        ["viewer-1", "viewer"],
      ]),
    );

    await expect(
      transferOrganizationOwnership(testContext.unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "manager-1",
        newOwnerUserId: "viewer-1",
        previousOwnerRole: "manager",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("removes a member through the cascading organization membership", async () => {
    const testContext = createTestUnitOfWork(
      new Map([
        ["manager-1", "manager"],
        ["athlete-1", "athlete"],
      ]),
    );

    await removeOrganizationMember(testContext.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "manager-1",
      targetUserId: "athlete-1",
    });

    expect(testContext.operations).toEqual(["delete:athlete-1"]);
    expect(testContext.roles.has("athlete-1")).toBe(false);
  });

  it("prevents ordinary member removal from deleting the Owner", async () => {
    const testContext = createTestUnitOfWork(
      new Map([
        ["manager-1", "manager"],
        ["owner-1", "owner"],
      ]),
    );

    await expect(
      removeOrganizationMember(testContext.unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "manager-1",
        targetUserId: "owner-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("creates an organization invitation for managers and owners", async () => {
    const testContext = createTestUnitOfWork(new Map([["owner-1", "owner"]]));

    const invitation = await createOrganizationInvitation(
      testContext.unitOfWork,
      {
        organizationId: "organization-1",
        actorUserId: "owner-1",
        invitedEmail: " NewMember@Example.com ",
        invitedRole: "manager",
        token: "invite-token-1",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    );

    expect(invitation.invitedEmail).toBe("newmember@example.com");
    expect(invitation.status).toBe("pending");
    expect(testContext.operations).toContain(
      "invite:newmember@example.com:manager",
    );
  });

  it("rejects duplicate pending invites for the same organization email", async () => {
    const testContext = createTestUnitOfWork(new Map([["owner-1", "owner"]]));

    await createOrganizationInvitation(testContext.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "owner-1",
      invitedEmail: "member@example.com",
      invitedRole: "viewer",
      token: "invite-token-1",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    await expect(
      createOrganizationInvitation(testContext.unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "owner-1",
        invitedEmail: "member@example.com",
        invitedRole: "athlete",
        token: "invite-token-2",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);
  });

  it("revokes a pending invitation", async () => {
    const testContext = createTestUnitOfWork(new Map([["owner-1", "owner"]]));

    const invitation = await createOrganizationInvitation(
      testContext.unitOfWork,
      {
        organizationId: "organization-1",
        actorUserId: "owner-1",
        invitedEmail: "member@example.com",
        invitedRole: "viewer",
        token: "invite-token-1",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    );

    await revokeOrganizationInvitation(testContext.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "owner-1",
      invitationId: invitation.id,
    });

    expect(testContext.invitations.get(invitation.id)?.status).toBe("revoked");
    expect(testContext.operations).toContain(`revoke:${invitation.id}`);
  });

  it("accepts a pending invitation and upserts membership role", async () => {
    const testContext = createTestUnitOfWork(new Map([["owner-1", "owner"]]));

    await createOrganizationInvitation(testContext.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "owner-1",
      invitedEmail: "newmember@example.com",
      invitedRole: "manager",
      token: "invite-token-1",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    const accepted = await acceptOrganizationInvitation(
      testContext.unitOfWork,
      {
        actorUserId: "new-user-1",
        actorEmail: "newmember@example.com",
        invitationToken: "invite-token-1",
      },
    );

    expect(accepted).toEqual({
      organizationId: "organization-1",
      role: "manager",
    });
    expect(testContext.roles.get("new-user-1")).toBe("manager");
    expect(testContext.operations).toContain("upsert:new-user-1:manager");
  });

  it("marks expired invitation during acceptance and rejects completion", async () => {
    const testContext = createTestUnitOfWork(new Map([["owner-1", "owner"]]));

    await createOrganizationInvitation(testContext.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "owner-1",
      invitedEmail: "newmember@example.com",
      invitedRole: "manager",
      token: "invite-token-1",
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    await expect(
      acceptOrganizationInvitation(testContext.unitOfWork, {
        actorUserId: "new-user-1",
        actorEmail: "newmember@example.com",
        invitationToken: "invite-token-1",
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(testContext.operations).toContain("expire:invitation-1");
  });
});
