import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/access-control/errors";
import type {
  OrganizationRole,
  TeamRole,
} from "@/modules/access-control/roles";

import {
  addOrUpdateTeamMember,
  createTeam,
  removeTeamMember,
  type TeamTransaction,
  type TeamUnitOfWork,
} from "./team-service";

function createTestUnitOfWork(options?: {
  organizationRoles?: Map<string, OrganizationRole>;
  teamRoles?: Map<string, TeamRole>;
  teamExists?: boolean;
}) {
  const organizationRoles = options?.organizationRoles ?? new Map();
  const teamRoles = options?.teamRoles ?? new Map();
  const operations: string[] = [];
  const transaction: TeamTransaction = {
    createTeam: vi.fn(async (organizationId, name) => {
      operations.push(`create-team:${name}`);
      return { id: "team-1", organizationId, name };
    }),
    teamExists: vi.fn(async () => options?.teamExists ?? true),
    findOrganizationRole: vi.fn(async (_organizationId, userId) => {
      return organizationRoles.get(userId) ?? null;
    }),
    findTeamRole: vi.fn(async (_organizationId, _teamId, userId) => {
      return teamRoles.get(userId) ?? null;
    }),
    addOrganizationAthlete: vi.fn(async (_organizationId, userId) => {
      operations.push(`add-organization-athlete:${userId}`);
      organizationRoles.set(userId, "athlete");
    }),
    upsertTeamMembership: vi.fn(
      async (_organizationId, _teamId, userId, role) => {
        operations.push(`upsert-team-member:${userId}:${role}`);
        teamRoles.set(userId, role);
      },
    ),
    deleteTeamMembership: vi.fn(async (_organizationId, _teamId, userId) => {
      operations.push(`delete-team-member:${userId}`);
      teamRoles.delete(userId);
    }),
  };
  const unitOfWork: TeamUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };

  return { operations, organizationRoles, teamRoles, unitOfWork };
}

describe("team service", () => {
  it("allows an organization Manager to create a team", async () => {
    const testContext = createTestUnitOfWork({
      organizationRoles: new Map([["manager-1", "manager"]]),
    });

    const team = await createTeam(testContext.unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "manager-1",
      name: "Varsity",
    });

    expect(team).toEqual({
      id: "team-1",
      organizationId: "organization-1",
      name: "Varsity",
    });
  });

  it("prevents an organization Viewer from creating a team", async () => {
    const testContext = createTestUnitOfWork({
      organizationRoles: new Map([["viewer-1", "viewer"]]),
    });

    await expect(
      createTeam(testContext.unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "viewer-1",
        name: "Varsity",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("creates missing organization membership before team membership", async () => {
    const testContext = createTestUnitOfWork({
      organizationRoles: new Map([["manager-1", "athlete"]]),
      teamRoles: new Map([["manager-1", "manager"]]),
    });

    await addOrUpdateTeamMember(testContext.unitOfWork, {
      organizationId: "organization-1",
      teamId: "team-1",
      actorUserId: "manager-1",
      targetUserId: "athlete-1",
      role: "athlete",
    });

    expect(testContext.operations).toEqual([
      "add-organization-athlete:athlete-1",
      "upsert-team-member:athlete-1:athlete",
    ]);
  });

  it("preserves an existing organization role when joining a team", async () => {
    const testContext = createTestUnitOfWork({
      organizationRoles: new Map([
        ["owner-1", "owner"],
        ["viewer-1", "viewer"],
      ]),
    });

    await addOrUpdateTeamMember(testContext.unitOfWork, {
      organizationId: "organization-1",
      teamId: "team-1",
      actorUserId: "owner-1",
      targetUserId: "viewer-1",
      role: "athlete",
    });

    expect(testContext.operations).toEqual([
      "upsert-team-member:viewer-1:athlete",
    ]);
    expect(testContext.organizationRoles.get("viewer-1")).toBe("viewer");
  });

  it("does not grant a Team Manager access to another team", async () => {
    const testContext = createTestUnitOfWork({
      organizationRoles: new Map([["manager-1", "athlete"]]),
    });

    await expect(
      addOrUpdateTeamMember(testContext.unitOfWork, {
        organizationId: "organization-1",
        teamId: "other-team",
        actorUserId: "manager-1",
        targetUserId: "athlete-1",
        role: "athlete",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("removes team membership without removing organization membership", async () => {
    const testContext = createTestUnitOfWork({
      organizationRoles: new Map([
        ["owner-1", "owner"],
        ["athlete-1", "athlete"],
      ]),
      teamRoles: new Map([["athlete-1", "athlete"]]),
    });

    await removeTeamMember(testContext.unitOfWork, {
      organizationId: "organization-1",
      teamId: "team-1",
      actorUserId: "owner-1",
      targetUserId: "athlete-1",
    });

    expect(testContext.operations).toEqual(["delete-team-member:athlete-1"]);
    expect(testContext.organizationRoles.get("athlete-1")).toBe("athlete");
  });
});
