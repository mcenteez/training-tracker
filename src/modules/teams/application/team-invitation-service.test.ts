import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";

import {
  acceptTeamInvitation,
  createTeamInvitation,
  revokeTeamInvitation,
  type TeamInvitationRecord,
  type TeamInvitationTransaction,
  type TeamInvitationUnitOfWork,
} from "./team-invitation-service";
import { hashTeamInvitationToken } from "./team-invitation-token";

const now = new Date("2026-08-12T12:00:00.000Z");

function invitation(
  overrides: Partial<TeamInvitationRecord> = {},
): TeamInvitationRecord {
  return {
    id: "invitation-1",
    organizationId: "organization-1",
    teamId: "team-1",
    invitedEmail: "athlete@example.com",
    role: "athlete",
    status: "pending",
    tokenHash: hashTeamInvitationToken("raw-token"),
    expiresAt: new Date("2026-08-19T12:00:00.000Z"),
    createdByUserId: "manager-1",
    acceptedByUserId: null,
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function createTestUnitOfWork(options?: {
  organizationRoles?: Map<string, OrganizationRole>;
  teamRoles?: Map<string, TeamRole>;
  teamExists?: boolean;
  invitations?: TeamInvitationRecord[];
}) {
  const organizationRoles = options?.organizationRoles ?? new Map();
  const teamRoles = options?.teamRoles ?? new Map();
  const invitations = options?.invitations ?? [];
  const operations: string[] = [];
  const transaction: TeamInvitationTransaction = {
    teamExists: vi.fn(async () => options?.teamExists ?? true),
    findOrganizationRole: vi.fn(
      async (_organizationId, userId) => organizationRoles.get(userId) ?? null,
    ),
    findTeamRole: vi.fn(
      async (_organizationId, _teamId, userId) => teamRoles.get(userId) ?? null,
    ),
    findPendingInvitationByEmail: vi.fn(
      async (organizationId, teamId, email) =>
        invitations.find(
          (item) =>
            item.organizationId === organizationId &&
            item.teamId === teamId &&
            item.invitedEmail === email &&
            item.status === "pending",
        ) ?? null,
    ),
    createInvitation: vi.fn(async (input) => {
      const created = invitation({
        ...input,
        id: `invitation-${invitations.length + 1}`,
      });
      invitations.push(created);
      operations.push(`create:${input.teamId}:${input.invitedEmail}`);
      return created;
    }),
    findInvitationById: vi.fn(
      async (organizationId, teamId, invitationId) =>
        invitations.find(
          (item) =>
            item.organizationId === organizationId &&
            item.teamId === teamId &&
            item.id === invitationId,
        ) ?? null,
    ),
    findInvitationByTokenHashForUpdate: vi.fn(
      async (tokenHash) =>
        invitations.find((item) => item.tokenHash === tokenHash) ?? null,
    ),
    markInvitationRevoked: vi.fn(async (invitationId) => {
      const item = invitations.find(
        (candidate) => candidate.id === invitationId,
      );
      if (item) item.status = "revoked";
      operations.push(`revoke:${invitationId}`);
    }),
    markInvitationExpired: vi.fn(async (invitationId) => {
      const item = invitations.find(
        (candidate) => candidate.id === invitationId,
      );
      if (item) item.status = "expired";
      operations.push(`expire:${invitationId}`);
    }),
    markInvitationAccepted: vi.fn(async (input) => {
      const item = invitations.find(
        (candidate) =>
          candidate.id === input.invitationId && candidate.status === "pending",
      );
      if (!item) return false;
      item.status = "accepted";
      operations.push(`accept:${input.invitationId}`);
      return true;
    }),
    addOrganizationAthlete: vi.fn(async (organizationId, userId) => {
      organizationRoles.set(userId, "athlete");
      operations.push(`add-athlete:${organizationId}:${userId}`);
    }),
    upsertTeamMembership: vi.fn(
      async (_organizationId, teamId, userId, role) => {
        teamRoles.set(userId, role);
        operations.push(`upsert-team:${teamId}:${userId}:${role}`);
      },
    ),
    recordAuditEvent: vi.fn(async (event) => {
      operations.push(`audit:${event.action}`);
    }),
  };
  const unitOfWork: TeamInvitationUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };

  return { invitations, operations, organizationRoles, teamRoles, unitOfWork };
}

describe("team invitation service", () => {
  it("creates a normalized, hash-only invitation for a managed team", async () => {
    const context = createTestUnitOfWork({
      organizationRoles: new Map([["manager-1", "athlete"]]),
      teamRoles: new Map([["manager-1", "manager"]]),
    });

    const result = await createTeamInvitation(context.unitOfWork, {
      organizationId: "organization-1",
      teamId: "team-1",
      actorUserId: "manager-1",
      invitedEmail: " Athlete@Example.com ",
      role: "athlete",
      token: "raw-token",
      expiresAt: new Date("2026-08-19T12:00:00.000Z"),
      now,
    });

    expect(result.token).toBe("raw-token");
    expect(result.invitation.invitedEmail).toBe("athlete@example.com");
    expect(result.invitation.tokenHash).toBe(
      hashTeamInvitationToken("raw-token"),
    );
    expect(result.invitation.tokenHash).not.toContain("raw-token");
    expect(context.operations).toEqual([
      "create:team-1:athlete@example.com",
      "audit:team.invite.created",
    ]);
  });

  it("rejects duplicate active invitations and unmanaged teams", async () => {
    const duplicateContext = createTestUnitOfWork({
      organizationRoles: new Map([["manager-1", "athlete"]]),
      teamRoles: new Map([["manager-1", "manager"]]),
      invitations: [invitation()],
    });

    await expect(
      createTeamInvitation(duplicateContext.unitOfWork, {
        organizationId: "organization-1",
        teamId: "team-1",
        actorUserId: "manager-1",
        invitedEmail: "athlete@example.com",
        role: "viewer",
        expiresAt: new Date("2026-08-19T12:00:00.000Z"),
        now,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    const unmanagedContext = createTestUnitOfWork({
      organizationRoles: new Map([["manager-1", "athlete"]]),
    });
    await expect(
      createTeamInvitation(unmanagedContext.unitOfWork, {
        organizationId: "organization-1",
        teamId: "other-team",
        actorUserId: "manager-1",
        invitedEmail: "new@example.com",
        role: "athlete",
        expiresAt: new Date("2026-08-19T12:00:00.000Z"),
        now,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("expires a stale pending invitation before creating its replacement", async () => {
    const context = createTestUnitOfWork({
      organizationRoles: new Map([["owner-1", "owner"]]),
      invitations: [
        invitation({ expiresAt: new Date("2026-08-11T12:00:00.000Z") }),
      ],
    });

    await createTeamInvitation(context.unitOfWork, {
      organizationId: "organization-1",
      teamId: "team-1",
      actorUserId: "owner-1",
      invitedEmail: "athlete@example.com",
      role: "athlete",
      token: "replacement-token",
      expiresAt: new Date("2026-08-19T12:00:00.000Z"),
      now,
    });

    expect(context.operations[0]).toBe("expire:invitation-1");
    expect(context.invitations).toHaveLength(2);
  });

  it("accepts transactionally with minimum organization access", async () => {
    const context = createTestUnitOfWork({ invitations: [invitation()] });

    await expect(
      acceptTeamInvitation(context.unitOfWork, {
        actorUserId: "athlete-1",
        actorEmail: "ATHLETE@example.com",
        token: "raw-token",
        now,
      }),
    ).resolves.toEqual({
      organizationId: "organization-1",
      teamId: "team-1",
      role: "athlete",
    });
    expect(context.operations).toEqual([
      "add-athlete:organization-1:athlete-1",
      "upsert-team:team-1:athlete-1:athlete",
      "accept:invitation-1",
      "audit:team.invite.accepted",
    ]);
  });

  it("preserves an existing organization role during acceptance", async () => {
    const context = createTestUnitOfWork({
      invitations: [invitation({ role: "manager" })],
      organizationRoles: new Map([["viewer-1", "viewer"]]),
    });

    await acceptTeamInvitation(context.unitOfWork, {
      actorUserId: "viewer-1",
      actorEmail: "athlete@example.com",
      token: "raw-token",
      now,
    });

    expect(context.organizationRoles.get("viewer-1")).toBe("viewer");
    expect(context.operations).not.toContain(
      "add-athlete:organization-1:viewer-1",
    );
    expect(context.teamRoles.get("viewer-1")).toBe("manager");
  });

  it("rejects wrong-email, expired, revoked, and replayed tokens", async () => {
    const wrongEmail = createTestUnitOfWork({ invitations: [invitation()] });
    await expect(
      acceptTeamInvitation(wrongEmail.unitOfWork, {
        actorUserId: "user-1",
        actorEmail: "other@example.com",
        token: "raw-token",
        now,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const expired = createTestUnitOfWork({
      invitations: [
        invitation({ expiresAt: new Date("2026-08-11T12:00:00.000Z") }),
      ],
    });
    await expect(
      acceptTeamInvitation(expired.unitOfWork, {
        actorUserId: "user-1",
        actorEmail: "athlete@example.com",
        token: "raw-token",
        now,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);
    expect(expired.invitations[0]?.status).toBe("expired");

    for (const status of ["revoked", "accepted"] as const) {
      const context = createTestUnitOfWork({
        invitations: [invitation({ status })],
      });
      await expect(
        acceptTeamInvitation(context.unitOfWork, {
          actorUserId: "user-1",
          actorEmail: "athlete@example.com",
          token: "raw-token",
          now,
        }),
      ).rejects.toBeInstanceOf(DomainInvariantError);
    }
  });

  it("revokes only a pending invitation from the authorized team", async () => {
    const context = createTestUnitOfWork({
      organizationRoles: new Map([["manager-1", "athlete"]]),
      teamRoles: new Map([["manager-1", "manager"]]),
      invitations: [invitation()],
    });

    await revokeTeamInvitation(context.unitOfWork, {
      organizationId: "organization-1",
      teamId: "team-1",
      actorUserId: "manager-1",
      invitationId: "invitation-1",
      now,
    });
    expect(context.operations).toEqual([
      "revoke:invitation-1",
      "audit:team.invite.revoked",
    ]);

    await expect(
      revokeTeamInvitation(context.unitOfWork, {
        organizationId: "organization-1",
        teamId: "other-team",
        actorUserId: "manager-1",
        invitationId: "invitation-1",
        now,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("returns not found for a foreign team identifier", async () => {
    const context = createTestUnitOfWork({
      organizationRoles: new Map([["owner-1", "owner"]]),
      teamExists: false,
    });

    await expect(
      createTeamInvitation(context.unitOfWork, {
        organizationId: "organization-1",
        teamId: "foreign-team",
        actorUserId: "owner-1",
        invitedEmail: "athlete@example.com",
        role: "athlete",
        expiresAt: new Date("2026-08-19T12:00:00.000Z"),
        now,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
