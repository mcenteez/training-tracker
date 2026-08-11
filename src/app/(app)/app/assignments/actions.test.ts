import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAssignmentMock,
  createAssignmentUnitOfWorkMock,
  listTeamMembershipsMock,
  loadActiveAppContextMock,
  redirectMock,
  revalidatePathMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  createAssignmentMock: vi.fn(),
  createAssignmentUnitOfWorkMock: vi.fn(),
  listTeamMembershipsMock: vi.fn(),
  loadActiveAppContextMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  withDatabaseMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));
vi.mock("@/modules/assignments/application/assignment-service", () => ({
  cancelAssignment: vi.fn(),
  createAssignment: createAssignmentMock,
  publishAssignment: vi.fn(),
  updateAssignment: vi.fn(),
}));
vi.mock("@/modules/assignments/db/unit-of-work", () => ({
  createAssignmentUnitOfWork: createAssignmentUnitOfWorkMock,
}));
vi.mock("@/modules/teams/db/queries", () => ({
  listTeamMembershipsForUserInOrganization: listTeamMembershipsMock,
}));

import { createAssignmentAction } from "./actions";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workoutId: "33333333-3333-4333-8333-333333333333",
  athleteId: "44444444-4444-4444-8444-444444444444",
  assignmentId: "55555555-5555-4555-8555-555555555555",
};

describe("assignment actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: ids.userId },
      membership: {
        organizationId: ids.organizationId,
        organizationRole: "owner",
        organizationTimezone: "America/New_York",
      },
    });
    listTeamMembershipsMock.mockResolvedValue([]);
    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({ id: "database" }),
    );
    createAssignmentUnitOfWorkMock.mockReturnValue({ id: "unit-of-work" });
    createAssignmentMock.mockResolvedValue({ id: ids.assignmentId });
  });

  it("redirects a newly created draft to its review page", async () => {
    const formData = new FormData();
    formData.set("sourceType", "workout");
    formData.set("sourceWorkoutId", ids.workoutId);
    formData.set("scheduledDate", "2026-09-02");
    formData.set("athleteUserIds", ids.athleteId);

    await expect(createAssignmentAction(formData)).rejects.toThrow(
      `REDIRECT:/app/assignments/${ids.assignmentId}?created=1`,
    );

    expect(createAssignmentMock).toHaveBeenCalledWith(
      { id: "unit-of-work" },
      expect.objectContaining({
        organizationId: ids.organizationId,
        actorUserId: ids.userId,
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/assignments");
  });
});
