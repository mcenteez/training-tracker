import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  acceptTeamInvitationMock,
  createTeamInvitationUnitOfWorkMock,
  loadAuthenticatedUserMock,
  redirectMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  acceptTeamInvitationMock: vi.fn(),
  createTeamInvitationUnitOfWorkMock: vi.fn(),
  loadAuthenticatedUserMock: vi.fn(),
  redirectMock: vi.fn(),
  withDatabaseMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/app-context", () => ({
  loadAuthenticatedUser: loadAuthenticatedUserMock,
}));
vi.mock("@/modules/teams/application/team-invitation-service", () => ({
  acceptTeamInvitation: acceptTeamInvitationMock,
}));
vi.mock("@/modules/teams/db/team-invitation-unit-of-work", () => ({
  createTeamInvitationUnitOfWork: createTeamInvitationUnitOfWorkMock,
}));

import { AuthorizationError } from "@/modules/access-control/errors";

import { acceptTeamInvitationAction } from "./actions";

describe("acceptTeamInvitationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    loadAuthenticatedUserMock.mockResolvedValue({
      id: "user-1",
      email: "athlete@example.com",
    });
    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({ id: "database" }),
    );
    createTeamInvitationUnitOfWorkMock.mockReturnValue({
      id: "invitation-unit-of-work",
    });
    acceptTeamInvitationMock.mockResolvedValue({
      organizationId: "organization-1",
      teamId: "team-1",
      role: "athlete",
    });
  });

  it("accepts for the authenticated user's verified email", async () => {
    await expect(acceptTeamInvitationAction("raw-token")).rejects.toThrow(
      "REDIRECT:/app?teamInviteAccepted=1",
    );

    expect(loadAuthenticatedUserMock).toHaveBeenCalledWith({
      signInRedirect: "/sign-in?redirect_url=/accept-team-invite/raw-token",
    });
    expect(acceptTeamInvitationMock).toHaveBeenCalledWith(
      { id: "invitation-unit-of-work" },
      {
        actorUserId: "user-1",
        actorEmail: "athlete@example.com",
        token: "raw-token",
      },
    );
  });

  it("collapses wrong-email and invalid invitation errors", async () => {
    acceptTeamInvitationMock.mockRejectedValue(new AuthorizationError());

    await expect(acceptTeamInvitationAction("raw-token")).rejects.toThrow(
      "REDIRECT:/accept-team-invite/raw-token?error=invite_unavailable",
    );
  });
});
