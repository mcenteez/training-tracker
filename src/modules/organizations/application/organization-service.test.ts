import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/access-control/errors";
import type { OrganizationRole } from "@/modules/access-control/roles";

import {
  createOrganizationWithOwner,
  removeOrganizationMember,
  transferOrganizationOwnership,
  type OrganizationTransaction,
  type OrganizationUnitOfWork,
} from "./organization-service";

function createTestUnitOfWork(
  roles: Map<string, OrganizationRole> = new Map(),
) {
  const operations: string[] = [];
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
    deleteMembership: vi.fn(async (_organizationId, userId) => {
      operations.push(`delete:${userId}`);
      roles.delete(userId);
    }),
  };
  const unitOfWork: OrganizationUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };

  return { operations, roles, unitOfWork };
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
});
