import { describe, expect, it } from "vitest";

import {
  buildTeamAssignmentCompliance,
  type TeamComplianceAssignmentInput,
  type TeamComplianceRecipientInput,
} from "./team-compliance";

const assignment: TeamComplianceAssignmentInput = {
  id: "assignment-1",
  sourceName: "Fall Plan",
  sourceType: "plan",
  timezone: "America/New_York",
  status: "published",
  startDate: "2026-08-03",
  endDate: "2026-08-23",
  scheduledDate: null,
  publishedAt: new Date("2026-08-01T12:00:00.000Z"),
  canceledAt: null,
};
const recipient: TeamComplianceRecipientInput = {
  id: "recipient-1",
  assignmentId: "assignment-1",
  athleteUserId: "athlete-1",
  fullName: "Athlete One",
  email: "athlete@example.com",
};

describe("buildTeamAssignmentCompliance", () => {
  it("classifies fixed occurrences and submitted sessions", () => {
    const result = buildTeamAssignmentCompliance({
      assignment,
      recipients: [recipient],
      slots: [
        {
          id: "slot-1",
          assignmentId: assignment.id,
          workoutSnapshotId: "workout-1",
          workoutName: "Lower Strength",
          scheduleType: "fixed_day",
          dayOfWeek: "monday",
          targetSessionsPerWeek: null,
          label: "Monday lift",
        },
      ],
      sessions: [
        {
          id: "session-1",
          assignmentId: assignment.id,
          recipientId: recipient.id,
          workoutSnapshotId: "workout-1",
          workoutName: "Lower Strength",
          planSlotSnapshotId: "slot-1",
          scheduledDate: "2026-08-10",
          status: "submitted",
          startedAt: new Date("2026-08-10T12:00:00.000Z"),
          submittedAt: new Date("2026-08-10T13:00:00.000Z"),
          updatedAt: new Date("2026-08-10T13:00:00.000Z"),
        },
      ],
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    expect(result.counts).toEqual({
      assigned: 0,
      inProgress: 0,
      submitted: 1,
      missed: 1,
      upcoming: 1,
    });
    expect(result.latestCompletionAt).toEqual(
      new Date("2026-08-10T13:00:00.000Z"),
    );
  });

  it("classifies remaining weekly frequency targets by week", () => {
    const result = buildTeamAssignmentCompliance({
      assignment,
      recipients: [recipient],
      slots: [
        {
          id: "slot-1",
          assignmentId: assignment.id,
          workoutSnapshotId: "workout-1",
          workoutName: "Conditioning",
          scheduleType: "weekly_frequency",
          dayOfWeek: null,
          targetSessionsPerWeek: 2,
          label: null,
        },
      ],
      sessions: [
        {
          id: "session-1",
          assignmentId: assignment.id,
          recipientId: recipient.id,
          workoutSnapshotId: "workout-1",
          workoutName: "Conditioning",
          planSlotSnapshotId: "slot-1",
          scheduledDate: "2026-08-11",
          status: "in_progress",
          startedAt: new Date("2026-08-11T12:00:00.000Z"),
          submittedAt: null,
          updatedAt: new Date("2026-08-11T12:00:00.000Z"),
        },
      ],
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    expect(result.counts).toEqual({
      assigned: 1,
      inProgress: 1,
      submitted: 0,
      missed: 2,
      upcoming: 2,
    });
  });

  it("stops generating future expectations after cancellation", () => {
    const result = buildTeamAssignmentCompliance({
      assignment: {
        ...assignment,
        status: "canceled",
        canceledAt: new Date("2026-08-11T16:00:00.000Z"),
      },
      recipients: [recipient],
      slots: [
        {
          id: "slot-1",
          assignmentId: assignment.id,
          workoutSnapshotId: "workout-1",
          workoutName: "Lower Strength",
          scheduleType: "fixed_day",
          dayOfWeek: "monday",
          targetSessionsPerWeek: null,
          label: null,
        },
      ],
      sessions: [],
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    expect(result.counts.upcoming).toBe(0);
    expect(result.counts.missed).toBe(2);
    expect(result.latestCompletionAt).toBeNull();
  });

  it("sorts recipients by overdue, started, completed, and upcoming priority", () => {
    const recipients = [
      {
        ...recipient,
        id: "recipient-overdue",
        athleteUserId: "athlete-overdue",
        email: "overdue@example.com",
      },
      {
        ...recipient,
        id: "recipient-completed",
        athleteUserId: "athlete-completed",
        email: "completed@example.com",
      },
      {
        ...recipient,
        id: "recipient-started",
        athleteUserId: "athlete-started",
        email: "started@example.com",
      },
    ];
    const result = buildTeamAssignmentCompliance({
      assignment: {
        ...assignment,
        sourceType: "workout",
        startDate: null,
        endDate: null,
        scheduledDate: "2026-08-11",
      },
      recipients,
      slots: [],
      sessions: [
        {
          id: "session-completed",
          assignmentId: assignment.id,
          recipientId: "recipient-completed",
          workoutSnapshotId: "workout-1",
          workoutName: "Lower Strength",
          planSlotSnapshotId: null,
          scheduledDate: "2026-08-11",
          status: "submitted",
          startedAt: new Date("2026-08-11T12:00:00.000Z"),
          submittedAt: new Date("2026-08-11T13:00:00.000Z"),
          updatedAt: new Date("2026-08-11T13:00:00.000Z"),
        },
        {
          id: "session-started",
          assignmentId: assignment.id,
          recipientId: "recipient-started",
          workoutSnapshotId: "workout-1",
          workoutName: "Lower Strength",
          planSlotSnapshotId: null,
          scheduledDate: "2026-08-11",
          status: "in_progress",
          startedAt: new Date("2026-08-11T12:00:00.000Z"),
          submittedAt: null,
          updatedAt: new Date("2026-08-11T12:00:00.000Z"),
        },
      ],
      now: new Date("2026-08-12T16:00:00.000Z"),
    });

    expect(result.recipients.map((item) => item.id)).toEqual([
      "recipient-overdue",
      "recipient-started",
      "recipient-completed",
    ]);
  });
});
