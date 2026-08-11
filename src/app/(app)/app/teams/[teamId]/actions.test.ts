import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTeamUnitOfWorkMock,
  loadActiveAppContextMock,
  redirectMock,
  revalidatePathMock,
  updateTeamMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  createTeamUnitOfWorkMock: vi.fn(),
  loadActiveAppContextMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  updateTeamMock: vi.fn(),
  withDatabaseMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));
vi.mock("@/modules/teams/application/team-service", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/modules/teams/application/team-service")
    >();

  return { ...original, updateTeam: updateTeamMock };
});
vi.mock("@/modules/teams/db/unit-of-work", () => ({
  createTeamUnitOfWork: createTeamUnitOfWorkMock,
}));

import { AuthorizationError } from "@/modules/access-control/errors";

import { updateTeamAction } from "./actions";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  teamId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
};

describe("team settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    loadActiveAppContextMock.mockResolvedValue({
      user: { id: ids.userId },
      membership: { organizationId: ids.organizationId },
    });
    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({ id: "database" }),
    );
    createTeamUnitOfWorkMock.mockReturnValue({ id: "unit-of-work" });
    updateTeamMock.mockResolvedValue({
      id: ids.teamId,
      organizationId: ids.organizationId,
      name: "Varsity Strength",
    });
  });

  it("updates a team and revalidates team surfaces", async () => {
    const formData = new FormData();
    formData.set("teamId", ids.teamId);
    formData.set("teamName", " Varsity Strength ");

    await expect(updateTeamAction(formData)).rejects.toThrow(
      `REDIRECT:/app/teams/${ids.teamId}?updated=1`,
    );

    expect(updateTeamMock).toHaveBeenCalledWith(
      { id: "unit-of-work" },
      {
        organizationId: ids.organizationId,
        teamId: ids.teamId,
        actorUserId: ids.userId,
        name: "Varsity Strength",
      },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/teams");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/app/performance/teams/${ids.teamId}`,
    );
  });

  it("rejects invalid team input before loading actor context", async () => {
    const formData = new FormData();
    formData.set("teamId", "not-a-team-id");
    formData.set("teamName", "A");

    await expect(updateTeamAction(formData)).rejects.toThrow(
      "REDIRECT:/app/teams?error=invalid_team_input",
    );

    expect(loadActiveAppContextMock).not.toHaveBeenCalled();
    expect(updateTeamMock).not.toHaveBeenCalled();
  });

  it("returns generic feedback when team update is unauthorized", async () => {
    updateTeamMock.mockRejectedValue(new AuthorizationError());
    const formData = new FormData();
    formData.set("teamId", ids.teamId);
    formData.set("teamName", "Varsity Strength");

    await expect(updateTeamAction(formData)).rejects.toThrow(
      `REDIRECT:/app/teams/${ids.teamId}?error=team_update_unavailable`,
    );

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
