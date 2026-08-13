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
      status: "submitted",
      startedAt: new Date("2026-08-12T12:00:00Z"),
      submittedAt: new Date("2026-08-12T13:00:00Z"),
      durationMinutes: 45,
      sessionRpe: 8,
      prescriptions: [
        {
          itemSnapshotId: "item-1",
          exerciseName: "Back Squat",
          blockLabel: "Main work",
          reps: 5,
          load: "95 kg",
          durationSeconds: null,
          distanceMeters: null,
          restSeconds: 120,
          tempo: null,
          notes: "Controlled descent",
        },
      ],
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
      trainingLoad: {
        id: "session-1",
        organizationId: "organization-1",
        assignmentId: "assignment-1",
        recipientId: "recipient-1",
        athleteUserId: "athlete-1",
        scheduledDate: "2026-08-12",
        timezone: "UTC",
        durationMinutes: 45,
        sessionRpe: 8,
        submittedAt: new Date("2026-08-12T13:00:00Z"),
        internalLoad: {
          state: "internalLoadAvailable",
          durationMinutes: 45,
          sessionRpe: 8,
          internalLoad: 360,
          sampleCount: 1,
          unavailableReasons: [],
        },
        externalWork: {
          state: "externalWorkComparable",
          prescribedVolumeKg: 475,
          completedVolumeKg: 475,
          completion: 1,
          prescribedRowCount: 1,
          prescribedMeasurableRowCount: 1,
          completedRowCount: 1,
          completedMeasurableRowCount: 1,
          unavailableReason: null,
        },
        baseline: {
          state: "available",
          sampleCount: 3,
          medianInternalLoad: 300,
          difference: 60,
          differencePercent: 0.2,
          currentInternalLoad: 360,
          unavailableReason: null,
          windowStartDate: "2026-07-15",
          windowEndDate: "2026-08-11",
        },
      },
      comments: [],
    });
  });

  it("shows completed results and comment controls to Team Managers", async () => {
    render(await StaffSessionResultPage({ params }));

    expect(loadAuthorizedTeamContextMock).toHaveBeenCalledWith(
      "team-1",
      "results.read.all",
    );
    expect(screen.getByRole("heading", { name: "Athlete One" })).toBeVisible();
    expect(screen.getByText("Completed results")).toBeVisible();
    expect(screen.getByText("Effective prescription used")).toBeVisible();
    expect(screen.getByText("5 reps - 95 kg - 120s rest")).toBeVisible();
    expect(screen.getByText(/Locked when this session started/)).toBeVisible();
    expect(screen.getAllByText("Back Squat")).toHaveLength(2);
    expect(screen.getByText("5 reps - 95 kg")).toBeVisible();
    expect(screen.getByText("360")).toBeVisible();
    expect(screen.getByText("45 minutes × session RPE 8")).toBeVisible();
    expect(screen.getByText(/475.0 kg prescribed denominator/)).toBeVisible();
    expect(screen.getByText(/Current 360; median 300/)).toBeVisible();
    expect(screen.getByText(/3 preceding sessions/)).toBeVisible();
    expect(screen.getByText(/not readiness or injury-risk/)).toBeVisible();
    expect(screen.getByText("Comment form")).toBeVisible();
  });

  it("shows completed results without comment controls to Team Viewers", async () => {
    loadAuthorizedTeamContextMock.mockResolvedValue({
      membership: { organizationId: "organization-1" },
      access: { organizationRole: "athlete", teamRole: "viewer" },
    });

    render(await StaffSessionResultPage({ params }));

    expect(screen.getAllByText("Back Squat")).toHaveLength(2);
    expect(screen.queryByText("Comment form")).toBeNull();
  });

  it("returns not found when the session is outside authorized scope", async () => {
    findStaffSessionResultDetailMock.mockResolvedValue(null);

    await expect(StaffSessionResultPage({ params })).rejects.toThrow(
      "NOT_FOUND",
    );
  });
});
