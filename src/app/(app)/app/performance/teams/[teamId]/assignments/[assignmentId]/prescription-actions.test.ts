import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createUnitOfWorkMock,
  loadActiveAppContextMock,
  redirectMock,
  revalidatePathMock,
  saveOverrideMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  createUnitOfWorkMock: vi.fn(),
  loadActiveAppContextMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  saveOverrideMock: vi.fn(),
  withDatabaseMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));
vi.mock(
  "@/modules/assignments/application/athlete-prescription-service",
  () => ({
    clearAthletePrescriptionOverride: vi.fn(),
    saveAthletePrescriptionOverride: saveOverrideMock,
  }),
);
vi.mock("@/modules/assignments/db/athlete-prescription-unit-of-work", () => ({
  createAthletePrescriptionUnitOfWork: createUnitOfWorkMock,
}));

import { saveAthletePrescriptionOverrideAction } from "./prescription-actions";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  teamId: "22222222-2222-4222-8222-222222222222",
  assignmentId: "33333333-3333-4333-8333-333333333333",
  recipientId: "44444444-4444-4444-8444-444444444444",
  athleteUserId: "55555555-5555-4555-8555-555555555555",
  itemSnapshotId: "66666666-6666-4666-8666-666666666666",
  actorUserId: "77777777-7777-4777-8777-777777777777",
};

function validFormData(): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    teamId: ids.teamId,
    assignmentId: ids.assignmentId,
    recipientId: ids.recipientId,
    athleteUserId: ids.athleteUserId,
    itemSnapshotId: ids.itemSnapshotId,
    reps: "20",
    load: "135 lb",
    loadValue: "135",
    loadUnit: "lb",
  })) {
    formData.set(key, value);
  }
  formData.append("overriddenFields", "reps");
  formData.append("overriddenFields", "load");
  return formData;
}

describe("saveAthletePrescriptionOverrideAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: ids.actorUserId },
      membership: { organizationId: ids.organizationId },
    });
    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({ id: "database" }),
    );
    createUnitOfWorkMock.mockReturnValue({ id: "unit-of-work" });
    saveOverrideMock.mockResolvedValue({ id: "override-1", version: 1 });
  });

  it("normalizes structured pounds before saving the athlete override", async () => {
    await saveAthletePrescriptionOverrideAction(validFormData());

    expect(saveOverrideMock).toHaveBeenCalledWith(
      { id: "unit-of-work" },
      expect.objectContaining({
        organizationId: ids.organizationId,
        actorUserId: ids.actorUserId,
        reps: 20,
        loadValue: "135",
        loadUnit: "lb",
        normalizedLoadKg: "61.23496995",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/app/performance/teams/${ids.teamId}/assignments/${ids.assignmentId}`,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/app/athlete/assignments/${ids.assignmentId}`,
    );
    expect(redirectMock).toHaveBeenCalledWith(
      `/app/performance/teams/${ids.teamId}/assignments/${ids.assignmentId}?prescription=saved`,
    );
  });

  it("rejects an incomplete structured load before reading the actor", async () => {
    const formData = validFormData();
    formData.delete("loadUnit");

    await expect(
      saveAthletePrescriptionOverrideAction(formData),
    ).rejects.toThrow("Prescription fields are invalid.");
    expect(loadActiveAppContextMock).not.toHaveBeenCalled();
  });
});
