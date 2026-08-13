import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
} from "@/modules/access-control/errors";

import {
  clearAthletePrescriptionOverride,
  saveAthletePrescriptionOverride,
  type AthletePrescriptionOverrideInput,
  type AthletePrescriptionTransaction,
  type AthletePrescriptionUnitOfWork,
} from "./athlete-prescription-service";

const input: AthletePrescriptionOverrideInput = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "22222222-2222-4222-8222-222222222222",
  assignmentId: "33333333-3333-4333-8333-333333333333",
  recipientId: "44444444-4444-4444-8444-444444444444",
  athleteUserId: "55555555-5555-4555-8555-555555555555",
  itemSnapshotId: "66666666-6666-4666-8666-666666666666",
  planSlotSnapshotId: null,
  expectedVersion: null,
  overriddenFields: ["reps", "load"],
  reps: 20,
  load: "135 lb",
  loadValue: "135",
  loadUnit: "lb",
  normalizedLoadKg: "61.23496995",
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: null,
  tempo: null,
  notes: null,
  reason: "Individual progression",
};

function setup(overrides: Partial<AthletePrescriptionTransaction> = {}) {
  const transaction: AthletePrescriptionTransaction = {
    findOrganizationRole: vi.fn(async () => "manager" as const),
    listTeamRoles: vi.fn(async () => []),
    findOverrideTarget: vi.fn(async () => ({
      assignmentStatus: "published" as const,
      recipientId: input.recipientId,
      athleteUserId: input.athleteUserId,
    })),
    recipientHasManagedTeamScope: vi.fn(async () => true),
    findOverride: vi.fn(async () => null),
    createOverride: vi.fn(async () => ({ id: "override-1", version: 1 })),
    updateOverride: vi.fn(async () => ({ id: "override-1", version: 2 })),
    deleteOverride: vi.fn(async () => true),
    ...overrides,
  };
  const unitOfWork: AthletePrescriptionUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };
  return { transaction, unitOfWork };
}

describe("athlete prescription overrides", () => {
  it("creates an athlete-specific override without touching the shared item", async () => {
    const { transaction, unitOfWork } = setup();

    await expect(
      saveAthletePrescriptionOverride(unitOfWork, input),
    ).resolves.toEqual({
      id: "override-1",
      version: 1,
    });

    expect(transaction.createOverride).toHaveBeenCalledWith(input);
  });

  it("allows a Team Manager only for a recipient in their persisted team scope", async () => {
    const { transaction, unitOfWork } = setup({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamRoles: vi.fn(async () => [
        { teamId: "team-1", role: "manager" as const },
      ]),
    });

    await saveAthletePrescriptionOverride(unitOfWork, input);

    expect(transaction.recipientHasManagedTeamScope).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      recipientId: input.recipientId,
      managedTeamIds: ["team-1"],
    });
  });

  it("rejects athletes and unmanaged Team Managers", async () => {
    const { unitOfWork } = setup({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamRoles: vi.fn(async () => []),
    });

    await expect(
      saveAthletePrescriptionOverride(unitOfWork, input),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects a stale override version", async () => {
    const { unitOfWork } = setup({
      findOverride: vi.fn(async () => ({ id: "override-1", version: 2 })),
    });

    await expect(
      saveAthletePrescriptionOverride(unitOfWork, {
        ...input,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);
  });

  it("clears a current override with its expected version", async () => {
    const { transaction, unitOfWork } = setup({
      findOverride: vi.fn(async () => ({ id: "override-1", version: 2 })),
    });

    await clearAthletePrescriptionOverride(unitOfWork, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      assignmentId: input.assignmentId,
      recipientId: input.recipientId,
      athleteUserId: input.athleteUserId,
      itemSnapshotId: input.itemSnapshotId,
      planSlotSnapshotId: input.planSlotSnapshotId,
      expectedVersion: 2,
    });

    expect(transaction.deleteOverride).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      overrideId: "override-1",
      expectedVersion: 2,
    });
  });
});
