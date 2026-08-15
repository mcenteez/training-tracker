import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import type { Assignment } from "@/modules/assignments/db/schema";

import {
  cancelAssignment,
  createAssignment,
  prepareAssignment,
  publishAssignment,
  returnPreparedAssignmentToDraft,
  updateAssignment,
  type AssignmentTransaction,
  type AssignmentUnitOfWork,
} from "./assignment-service";

const createInput = {
  organizationId: "organization-1",
  actorUserId: "user-1",
  timezone: "UTC",
  source: {
    sourceType: "workout" as const,
    sourceWorkoutId: "workout-1",
    scheduledDate: "2026-09-01",
    availableFrom: null,
    availableUntil: null,
  },
  targets: [{ targetType: "team" as const, teamId: "team-1" }],
};

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "assignment-1",
    organizationId: "organization-1",
    sourcePlanId: null,
    sourceWorkoutId: "workout-1",
    timezone: "UTC",
    startDate: null,
    endDate: null,
    scheduledDate: "2026-09-01",
    availableFrom: null,
    availableUntil: null,
    timelinessPolicyVersion: 1,
    timelinessPolicyEffectiveAt: new Date("2026-08-12T00:00:00.000Z"),
    fixedDueLocalMinute: 1440,
    weeklyDueDay: 7,
    weeklyDueLocalMinute: 1440,
    lateEntryDays: 7,
    status: "draft",
    preparedAt: null,
    preparedByUserId: null,
    preparationResetAt: null,
    preparationResetByUserId: null,
    publishedAt: null,
    canceledAt: null,
    version: 1,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(overrides: Partial<AssignmentTransaction> = {}) {
  const transaction: AssignmentTransaction = {
    findOrganizationRole: vi.fn(async (_organizationId, userId) =>
      userId === "user-1" ? ("manager" as const) : ("athlete" as const),
    ),
    listTeamRoles: vi.fn(async () => [
      { teamId: "team-1", role: "manager" as const },
    ]),
    findAssignment: vi.fn(async () => assignment()),
    findPlan: vi.fn(async () => ({ id: "plan-1", status: "active" })),
    findWorkout: vi.fn(async () => ({ id: "workout-1", status: "active" })),
    createAssignmentDraft: vi.fn(async () => assignment()),
    updateAssignmentDraft: vi.fn(async () => assignment({ version: 2 })),
    replaceAssignmentTargets: vi.fn(async () => undefined),
    listAssignmentTargets: vi.fn(async () => [
      {
        id: "target-1",
        targetType: "team" as const,
        teamId: "team-1",
        athleteUserId: null,
      },
    ]),
    listAthleteUserIdsForTeam: vi.fn(async () => ["athlete-1"]),
    listTeamIdsForAthlete: vi.fn(async () => ["team-1"]),
    replaceAssignmentRecipients: vi.fn(async () => undefined),
    listAssignmentRecipients: vi.fn(async () => [
      { athleteUserId: "athlete-1", teamIds: ["team-1"] },
    ]),
    snapshotAssignmentSource: vi.fn(async () => 1),
    markAssignmentPrepared: vi.fn(async () =>
      assignment({ status: "prepared", version: 2 }),
    ),
    resetAssignmentPreparation: vi.fn(async () =>
      assignment({ status: "draft", version: 3 }),
    ),
    markAssignmentPublished: vi.fn(async () =>
      assignment({ status: "published", version: 3 }),
    ),
    markAssignmentCanceled: vi.fn(async () =>
      assignment({ status: "canceled", version: 2 }),
    ),
    ...overrides,
  };

  const unitOfWork: AssignmentUnitOfWork = {
    transaction: vi.fn(async (operation) => operation(transaction)),
  };

  return { transaction, unitOfWork };
}

describe("assignment service", () => {
  it("creates assignment drafts for managers", async () => {
    const { transaction, unitOfWork } = setup();

    await createAssignment(unitOfWork, createInput);

    expect(transaction.createAssignmentDraft).toHaveBeenCalledOnce();
    expect(transaction.replaceAssignmentTargets).toHaveBeenCalledOnce();
  });

  it("denies assignment creation for viewers", async () => {
    const { unitOfWork } = setup({
      findOrganizationRole: vi.fn(async () => "viewer" as const),
      listTeamRoles: vi.fn(async () => []),
    });

    await expect(
      createAssignment(unitOfWork, createInput),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("prevents team-manager assignment outside managed teams", async () => {
    const { unitOfWork } = setup({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamRoles: vi.fn(async () => [
        { teamId: "team-1", role: "manager" as const },
      ]),
    });

    await expect(
      createAssignment(unitOfWork, {
        ...createInput,
        targets: [{ targetType: "team", teamId: "team-2" }],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("prevents team-manager assignment to athletes outside managed teams", async () => {
    const { unitOfWork } = setup({
      findOrganizationRole: vi.fn(async (_organizationId, userId) =>
        userId === "user-1" ? ("athlete" as const) : ("athlete" as const),
      ),
      listTeamRoles: vi.fn(async () => [
        { teamId: "team-1", role: "manager" as const },
      ]),
      listTeamIdsForAthlete: vi.fn(async () => ["team-2"]),
    });

    await expect(
      createAssignment(unitOfWork, {
        ...createInput,
        targets: [{ targetType: "athlete", athleteUserId: "outside-athlete" }],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects direct targets that are not organization athletes", async () => {
    const { transaction, unitOfWork } = setup({
      findOrganizationRole: vi.fn(async (_organizationId, userId) =>
        userId === "user-1" ? ("manager" as const) : ("viewer" as const),
      ),
    });

    await expect(
      createAssignment(unitOfWork, {
        ...createInput,
        targets: [{ targetType: "athlete", athleteUserId: "not-an-athlete" }],
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(transaction.createAssignmentDraft).not.toHaveBeenCalled();
  });

  it("rejects stale assignment updates", async () => {
    const { transaction, unitOfWork } = setup({
      findAssignment: vi.fn(async () => assignment({ version: 2 })),
    });

    await expect(
      updateAssignment(unitOfWork, {
        ...createInput,
        assignmentId: "assignment-1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(transaction.updateAssignmentDraft).not.toHaveBeenCalled();
  });

  it("prepares eligible assignments and resolves recipients", async () => {
    const { transaction, unitOfWork } = setup();

    await prepareAssignment(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      assignmentId: "assignment-1",
      expectedVersion: 1,
    });

    expect(transaction.replaceAssignmentRecipients).toHaveBeenCalledWith(
      "organization-1",
      "assignment-1",
      [{ athleteUserId: "athlete-1", teamIds: ["team-1"] }],
    );
    expect(transaction.snapshotAssignmentSource).toHaveBeenCalledWith(
      "organization-1",
      "assignment-1",
      createInput.source,
    );
    expect(transaction.markAssignmentPrepared).toHaveBeenCalledOnce();
  });

  it("merges team and direct-athlete scopes for one prepared recipient", async () => {
    const { transaction, unitOfWork } = setup({
      findOrganizationRole: vi.fn(async (_organizationId, userId) =>
        userId === "user-1" ? ("manager" as const) : ("athlete" as const),
      ),
      listAssignmentTargets: vi.fn(async () => [
        {
          id: "target-1",
          targetType: "team" as const,
          teamId: "team-1",
          athleteUserId: null,
        },
        {
          id: "target-2",
          targetType: "athlete" as const,
          teamId: null,
          athleteUserId: "athlete-1",
        },
      ]),
      listTeamIdsForAthlete: vi.fn(async () => ["team-1", "team-2"]),
    });

    await prepareAssignment(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      assignmentId: "assignment-1",
      expectedVersion: 1,
    });

    expect(transaction.replaceAssignmentRecipients).toHaveBeenCalledWith(
      "organization-1",
      "assignment-1",
      [{ athleteUserId: "athlete-1", teamIds: ["team-1", "team-2"] }],
    );
  });

  it("rejects preparation when source produces no workout snapshots", async () => {
    const { transaction, unitOfWork } = setup({
      snapshotAssignmentSource: vi.fn(async () => 0),
    });

    await expect(
      prepareAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(transaction.markAssignmentPrepared).not.toHaveBeenCalled();
  });

  it("rejects preparation when source workout is inactive", async () => {
    const { unitOfWork } = setup({
      findWorkout: vi.fn(async () => ({ id: "workout-1", status: "draft" })),
    });

    await expect(
      prepareAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);
  });

  it("rejects preparation when a direct target is not an organization athlete", async () => {
    const { transaction, unitOfWork } = setup({
      findOrganizationRole: vi.fn(async (_organizationId, userId) =>
        userId === "user-1" ? ("manager" as const) : ("viewer" as const),
      ),
      listAssignmentTargets: vi.fn(async () => [
        {
          id: "target-1",
          targetType: "athlete" as const,
          teamId: null,
          athleteUserId: "not-an-athlete",
        },
      ]),
    });

    await expect(
      prepareAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(transaction.replaceAssignmentRecipients).not.toHaveBeenCalled();
  });

  it("rejects preparation with no recipients", async () => {
    const { unitOfWork } = setup({
      listAssignmentTargets: vi.fn(async () => [
        {
          id: "target-1",
          targetType: "team" as const,
          teamId: "team-1",
          athleteUserId: null,
        },
      ]),
      listAthleteUserIdsForTeam: vi.fn(async () => []),
    });

    await expect(
      prepareAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);
  });

  it("publishes a prepared assignment without recreating recipients or snapshots", async () => {
    const { transaction, unitOfWork } = setup({
      findAssignment: vi.fn(async () =>
        assignment({ status: "prepared", version: 2 }),
      ),
    });

    await publishAssignment(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      assignmentId: "assignment-1",
      expectedVersion: 2,
    });

    expect(transaction.replaceAssignmentRecipients).not.toHaveBeenCalled();
    expect(transaction.snapshotAssignmentSource).not.toHaveBeenCalled();
    expect(transaction.markAssignmentPublished).toHaveBeenCalledOnce();
  });

  it("rejects publication when a prepared recipient is no longer an athlete", async () => {
    const { transaction, unitOfWork } = setup({
      findAssignment: vi.fn(async () =>
        assignment({ status: "prepared", version: 2 }),
      ),
      findOrganizationRole: vi.fn(async (_organizationId, userId) =>
        userId === "user-1" ? ("manager" as const) : ("viewer" as const),
      ),
    });

    await expect(
      publishAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(transaction.markAssignmentPublished).not.toHaveBeenCalled();
  });

  it("rejects publication when a Team Manager loses current recipient scope", async () => {
    const { transaction, unitOfWork } = setup({
      findAssignment: vi.fn(async () =>
        assignment({ status: "prepared", version: 2 }),
      ),
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listTeamIdsForAthlete: vi.fn(async (_organizationId, athleteUserId) =>
        athleteUserId === "athlete-1" ? [] : ["team-1"],
      ),
    });

    await expect(
      publishAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(transaction.markAssignmentPublished).not.toHaveBeenCalled();
  });

  it("rejects direct publication of a draft", async () => {
    const { transaction, unitOfWork } = setup();

    await expect(
      publishAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DomainInvariantError);

    expect(transaction.markAssignmentPublished).not.toHaveBeenCalled();
  });

  it.each(["prepared", "published", "canceled"] as const)(
    "rejects preparation from %s status",
    async (status) => {
      const { transaction, unitOfWork } = setup({
        findAssignment: vi.fn(async () => assignment({ status })),
      });

      await expect(
        prepareAssignment(unitOfWork, {
          organizationId: "organization-1",
          actorUserId: "user-1",
          assignmentId: "assignment-1",
          expectedVersion: 1,
        }),
      ).rejects.toBeInstanceOf(DomainInvariantError);

      expect(transaction.markAssignmentPrepared).not.toHaveBeenCalled();
    },
  );

  it("returns a prepared assignment to draft", async () => {
    const { transaction, unitOfWork } = setup({
      findAssignment: vi.fn(async () =>
        assignment({ status: "prepared", version: 2 }),
      ),
    });

    const reset = await returnPreparedAssignmentToDraft(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      assignmentId: "assignment-1",
      expectedVersion: 2,
    });

    expect(reset.status).toBe("draft");
    expect(transaction.resetAssignmentPreparation).toHaveBeenCalledOnce();
  });

  it.each(["draft", "published", "canceled"] as const)(
    "rejects returning a %s assignment to draft",
    async (status) => {
      const { transaction, unitOfWork } = setup({
        findAssignment: vi.fn(async () => assignment({ status })),
      });

      await expect(
        returnPreparedAssignmentToDraft(unitOfWork, {
          organizationId: "organization-1",
          actorUserId: "user-1",
          assignmentId: "assignment-1",
          expectedVersion: 1,
        }),
      ).rejects.toBeInstanceOf(DomainInvariantError);

      expect(transaction.resetAssignmentPreparation).not.toHaveBeenCalled();
    },
  );

  it("cancels prepared assignments", async () => {
    const { unitOfWork } = setup({
      findAssignment: vi.fn(async () => assignment({ status: "prepared" })),
    });

    const canceled = await cancelAssignment(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      assignmentId: "assignment-1",
      expectedVersion: 1,
    });

    expect(canceled.status).toBe("canceled");
  });

  it("cancels published assignments", async () => {
    const { unitOfWork } = setup({
      findAssignment: vi.fn(async () => assignment({ status: "published" })),
    });

    const canceled = await cancelAssignment(unitOfWork, {
      organizationId: "organization-1",
      actorUserId: "user-1",
      assignmentId: "assignment-1",
      expectedVersion: 1,
    });

    expect(canceled.status).toBe("canceled");
  });

  it("prevents team managers from canceling assignments outside managed teams", async () => {
    const { transaction, unitOfWork } = setup({
      findOrganizationRole: vi.fn(async () => "athlete" as const),
      listAssignmentTargets: vi.fn(async () => [
        {
          id: "target-2",
          targetType: "team" as const,
          teamId: "team-2",
          athleteUserId: null,
        },
      ]),
    });

    await expect(
      cancelAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(transaction.markAssignmentCanceled).not.toHaveBeenCalled();
  });

  it("raises not-found errors for missing assignments", async () => {
    const { unitOfWork } = setup({
      findAssignment: vi.fn(async () => null),
    });

    await expect(
      publishAssignment(unitOfWork, {
        organizationId: "organization-1",
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
