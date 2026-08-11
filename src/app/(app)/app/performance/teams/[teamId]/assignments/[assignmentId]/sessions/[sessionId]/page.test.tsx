import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  findStaffSessionResultDetailMock,
  loadAuthorizedTeamContextMock,
  notFoundMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  findStaffSessionResultDetailMock: vi.fn(),
  loadAuthorizedTeamContextMock: vi.fn(),
  notFoundMock: vi.fn(),
  withDatabaseMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/team-context", () => ({
  loadAuthorizedTeamContext: loadAuthorizedTeamContextMock,
}));
vi.mock("@/modules/assignments/db/staff-session-result-queries", () => ({
  findStaffSessionResultDetail: findStaffSessionResultDetailMock,
}));
vi.mock("./comment-form", () => ({
  StaffSessionCommentForm: () => <div>Comment form</div>,
}));

import StaffSessionResultPage from "./page";

afterEach(cleanup);

const params = Promise.resolve({
  teamId: "team-1",
  assignmentId: "assignment-1",
  sessionId: "session-1",
});

describe("staff session result page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFoundMock.mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });
    withDatabaseMock.mockImplementation(
      async (operation: (database: unknown) => Promise<unknown>) =>
        operation({ id: "database" }),
    );
    loadAuthorizedTeamContextMock.mockResolvedValue({
      membership: { organizationId: "organization-1" },
      access: { organizationRole: "athlete", teamRole: "manager" },
    });
    findStaffSessionResultDetailMock.mockResolvedValue({
      id: "session-1",
      assignmentId: "assignment-1",
      athleteUserId: "athlete-1",
      athleteName: "Athlete One",
      athleteEmail: "athlete@example.com",
      workoutName: "Lower Strength",
      scheduledDate: "2026-08-12",
      startedAt: new Date("2026-08-12T12:00:00Z"),
      submittedAt: new Date("2026-08-12T13:00:00Z"),
      results: [
        {
          itemSnapshotId: "item-1",
          exerciseName: "Back Squat",
          blockLabel: "Main work",
          blockPosition: 0,
          itemPosition: 0,
          roundNumber: 1,
          completedAt: new Date("2026-08-12T12:30:00Z"),
          reps: 5,
          load: "95 kg",
          durationSeconds: null,
          distanceMeters: null,
          notes: null,
        },
      ],
      comments: [],
    });
  });

  it("shows submitted results and comment controls to Team Managers", async () => {
    render(await StaffSessionResultPage({ params }));

    expect(loadAuthorizedTeamContextMock).toHaveBeenCalledWith(
      "team-1",
      "results.read.all",
    );
    expect(screen.getByRole("heading", { name: "Athlete One" })).toBeVisible();
    expect(screen.getByText("Back Squat")).toBeVisible();
    expect(screen.getByText("5 reps - 95 kg")).toBeVisible();
    expect(screen.getByText("Comment form")).toBeVisible();
  });

  it("shows submitted results without comment controls to Team Viewers", async () => {
    loadAuthorizedTeamContextMock.mockResolvedValue({
      membership: { organizationId: "organization-1" },
      access: { organizationRole: "athlete", teamRole: "viewer" },
    });

    render(await StaffSessionResultPage({ params }));

    expect(screen.getByText("Back Squat")).toBeVisible();
    expect(screen.queryByText("Comment form")).toBeNull();
  });

  it("returns not found when the session is outside authorized scope", async () => {
    findStaffSessionResultDetailMock.mockResolvedValue(null);

    await expect(StaffSessionResultPage({ params })).rejects.toThrow(
      "NOT_FOUND",
    );
  });
});
