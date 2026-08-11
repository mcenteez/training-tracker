import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addOrUpdateTeamMemberMock,
  createTeamInvitationMock,
  createTeamInvitationUnitOfWorkMock,
  createTeamUnitOfWorkMock,
  findOrganizationMemberByEmailMock,
  loadActiveAppContextMock,
  redirectMock,
  removeTeamMemberMock,
  revokeTeamInvitationMock,
  revalidatePathMock,
  updateTeamMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  addOrUpdateTeamMemberMock: vi.fn(),
  createTeamInvitationMock: vi.fn(),
  createTeamInvitationUnitOfWorkMock: vi.fn(),
  createTeamUnitOfWorkMock: vi.fn(),
  findOrganizationMemberByEmailMock: vi.fn(),
  loadActiveAppContextMock: vi.fn(),
  redirectMock: vi.fn(),
  removeTeamMemberMock: vi.fn(),
  revokeTeamInvitationMock: vi.fn(),
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

  return {
    ...original,
    addOrUpdateTeamMember: addOrUpdateTeamMemberMock,
    removeTeamMember: removeTeamMemberMock,
    updateTeam: updateTeamMock,
  };
});
vi.mock("@/modules/teams/application/team-invitation-service", () => ({
  createTeamInvitation: createTeamInvitationMock,
  revokeTeamInvitation: revokeTeamInvitationMock,
}));
vi.mock("@/modules/teams/db/queries", () => ({
  findOrganizationMemberByEmail: findOrganizationMemberByEmailMock,
}));
vi.mock("@/modules/teams/db/unit-of-work", () => ({
  createTeamUnitOfWork: createTeamUnitOfWorkMock,
}));
vi.mock("@/modules/teams/db/team-invitation-unit-of-work", () => ({
  createTeamInvitationUnitOfWork: createTeamInvitationUnitOfWorkMock,
}));

import { AuthorizationError } from "@/modules/access-control/errors";

import {
  addTeamMemberAction,
  createTeamInvitationAction,
  removeTeamMemberAction,
  revokeTeamInvitationAction,
  updateTeamAction,
  updateTeamMemberAction,
} from "./actions";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  teamId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  memberId: "44444444-4444-4444-8444-444444444444",
  invitationId: "55555555-5555-4555-8555-555555555555",
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
    createTeamInvitationUnitOfWorkMock.mockReturnValue({
      id: "invitation-unit-of-work",
    });
    updateTeamMock.mockResolvedValue({
      id: ids.teamId,
      organizationId: ids.organizationId,
      name: "Varsity Strength",
    });
    findOrganizationMemberByEmailMock.mockResolvedValue({
      userId: ids.memberId,
      email: "athlete@example.com",
      fullName: "Athlete Example",
      organizationRole: "athlete",
    });
    addOrUpdateTeamMemberMock.mockResolvedValue(undefined);
    removeTeamMemberMock.mockResolvedValue(undefined);
    createTeamInvitationMock.mockResolvedValue({
      invitation: { id: ids.invitationId },
      token: "share-token",
    });
    revokeTeamInvitationMock.mockResolvedValue(undefined);
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

  it("adds an existing organization member by exact email", async () => {
    const formData = new FormData();
    formData.set("teamId", ids.teamId);
    formData.set("email", " ATHLETE@example.com ");
    formData.set("role", "athlete");

    await expect(addTeamMemberAction(formData)).rejects.toThrow(
      `REDIRECT:/app/teams/${ids.teamId}?memberSaved=1`,
    );

    expect(findOrganizationMemberByEmailMock).toHaveBeenCalledWith(
      { id: "database" },
      { organizationId: ids.organizationId, email: "athlete@example.com" },
    );
    expect(addOrUpdateTeamMemberMock).toHaveBeenCalledWith(
      { id: "unit-of-work" },
      {
        organizationId: ids.organizationId,
        teamId: ids.teamId,
        actorUserId: ids.userId,
        targetUserId: ids.memberId,
        role: "athlete",
      },
    );
  });

  it("updates an existing team member role", async () => {
    const formData = new FormData();
    formData.set("teamId", ids.teamId);
    formData.set("userId", ids.memberId);
    formData.set("role", "viewer");

    await expect(updateTeamMemberAction(formData)).rejects.toThrow(
      `REDIRECT:/app/teams/${ids.teamId}?memberSaved=1`,
    );

    expect(addOrUpdateTeamMemberMock).toHaveBeenCalledWith(
      { id: "unit-of-work" },
      expect.objectContaining({
        organizationId: ids.organizationId,
        teamId: ids.teamId,
        targetUserId: ids.memberId,
        role: "viewer",
      }),
    );
  });

  it("removes a team member without changing organization membership", async () => {
    const formData = new FormData();
    formData.set("teamId", ids.teamId);
    formData.set("userId", ids.memberId);

    await expect(removeTeamMemberAction(formData)).rejects.toThrow(
      `REDIRECT:/app/teams/${ids.teamId}?memberRemoved=1`,
    );

    expect(removeTeamMemberMock).toHaveBeenCalledWith(
      { id: "unit-of-work" },
      {
        organizationId: ids.organizationId,
        teamId: ids.teamId,
        actorUserId: ids.userId,
        targetUserId: ids.memberId,
      },
    );
  });

  it("creates a team-scoped invitation and returns its share token", async () => {
    const formData = new FormData();
    formData.set("teamId", ids.teamId);
    formData.set("email", " NEW@example.com ");
    formData.set("role", "athlete");

    await expect(createTeamInvitationAction(formData)).rejects.toThrow(
      `REDIRECT:/app/teams/${ids.teamId}?inviteToken=share-token`,
    );

    expect(createTeamInvitationMock).toHaveBeenCalledWith(
      { id: "invitation-unit-of-work" },
      {
        organizationId: ids.organizationId,
        teamId: ids.teamId,
        actorUserId: ids.userId,
        invitedEmail: "new@example.com",
        role: "athlete",
        expiresAt: expect.any(Date),
      },
    );
  });

  it("revokes an invitation only within the active organization and team", async () => {
    const formData = new FormData();
    formData.set("teamId", ids.teamId);
    formData.set("invitationId", ids.invitationId);

    await expect(revokeTeamInvitationAction(formData)).rejects.toThrow(
      `REDIRECT:/app/teams/${ids.teamId}?invitationRevoked=1`,
    );

    expect(revokeTeamInvitationMock).toHaveBeenCalledWith(
      { id: "invitation-unit-of-work" },
      {
        organizationId: ids.organizationId,
        teamId: ids.teamId,
        actorUserId: ids.userId,
        invitationId: ids.invitationId,
      },
    );
  });
});
