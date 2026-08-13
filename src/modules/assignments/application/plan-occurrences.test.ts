import { describe, expect, it } from "vitest";

import type {
  AthletePlanSessionSummary,
  AthletePlanSlotSnapshot,
} from "@/modules/assignments/db/queries";

import { buildPlanOccurrenceOverview } from "./plan-occurrences";

const fixedSlot: AthletePlanSlotSnapshot = {
  id: "slot-fixed",
  workoutSnapshotId: "workout-1",
  workoutName: "Push A",
  scheduleType: "fixed_day",
  dayOfWeek: "monday",
  targetSessionsPerWeek: null,
  position: 0,
  label: "Strength",
};

const flexibleSlot: AthletePlanSlotSnapshot = {
  id: "slot-flex",
  workoutSnapshotId: "workout-2",
  workoutName: "Conditioning",
  scheduleType: "weekly_frequency",
  dayOfWeek: null,
  targetSessionsPerWeek: 2,
  position: 1,
  label: null,
};

function session(
  overrides: Partial<AthletePlanSessionSummary>,
): AthletePlanSessionSummary {
  return {
    id: "session-1",
    workoutSnapshotId: "workout-1",
    planSlotSnapshotId: "slot-fixed",
    scheduledDate: "2026-08-10",
    status: "submitted",
    version: 2,
    startedAt: new Date("2026-08-10T10:00:00.000Z"),
    submittedAt: new Date("2026-08-10T11:00:00.000Z"),
    ...overrides,
  };
}

// Tuesday 2026-08-11 in UTC; assignment runs three weeks.
const baseInput = {
  startDate: "2026-08-10",
  endDate: "2026-08-30",
  timezone: "UTC",
  now: new Date("2026-08-11T15:00:00.000Z"),
};

describe("buildPlanOccurrenceOverview", () => {
  it("generates fixed-day occurrences bounded by assignment dates", () => {
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      slots: [fixedSlot],
      sessions: [],
    });

    expect(
      overview.fixedOccurrences.map((occurrence) => occurrence.scheduledDate),
    ).toEqual(["2026-08-10", "2026-08-17", "2026-08-24"]);
    expect(overview.fixedOccurrences[0]?.status).toBe("missed");
    expect(overview.fixedOccurrences[1]?.status).toBe("upcoming");
  });

  it("marks fixed occurrences with their session state", () => {
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      slots: [fixedSlot],
      sessions: [session({ scheduledDate: "2026-08-10" })],
    });

    expect(overview.fixedOccurrences[0]).toMatchObject({
      scheduledDate: "2026-08-10",
      status: "submitted",
      sessionId: "session-1",
    });
    expect(overview.completedHistory).toHaveLength(1);
  });

  it("computes weekly progress for flexible slots in the current week", () => {
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      slots: [flexibleSlot],
      sessions: [
        session({
          id: "flex-1",
          workoutSnapshotId: "workout-2",
          planSlotSnapshotId: "slot-flex",
          scheduledDate: "2026-08-10",
          status: "submitted",
        }),
        session({
          id: "flex-old",
          workoutSnapshotId: "workout-2",
          planSlotSnapshotId: "slot-flex",
          scheduledDate: "2026-08-03",
          status: "submitted",
        }),
      ],
    });

    const slot = overview.flexibleSlots[0]!;
    expect(slot.completedThisWeek).toBe(1);
    expect(slot.targetMet).toBe(false);
    expect(slot.weekSessions).toHaveLength(1);
    expect(overview.completedHistory).toHaveLength(2);
  });

  it("counts in-progress flexible sessions toward the weekly target", () => {
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      slots: [flexibleSlot],
      sessions: [
        session({
          id: "flex-1",
          workoutSnapshotId: "workout-2",
          planSlotSnapshotId: "slot-flex",
          scheduledDate: "2026-08-10",
          status: "submitted",
        }),
        session({
          id: "flex-2",
          workoutSnapshotId: "workout-2",
          planSlotSnapshotId: "slot-flex",
          scheduledDate: "2026-08-11",
          status: "in_progress",
          submittedAt: null,
        }),
      ],
    });

    const slot = overview.flexibleSlots[0]!;
    expect(slot.targetMet).toBe(true);
    expect(slot.inProgressDate).toBe("2026-08-11");
  });

  it("marks a flexible slot fulfilled after its weekly target is completed", () => {
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      slots: [flexibleSlot],
      sessions: [
        session({
          id: "flex-1",
          workoutSnapshotId: "workout-2",
          planSlotSnapshotId: "slot-flex",
          scheduledDate: "2026-08-10",
          status: "submitted",
        }),
        session({
          id: "flex-2",
          workoutSnapshotId: "workout-2",
          planSlotSnapshotId: "slot-flex",
          scheduledDate: "2026-08-11",
          status: "submitted",
        }),
      ],
    });

    const slot = overview.flexibleSlots[0]!;
    expect(slot).toMatchObject({
      completedThisWeek: 2,
      targetMet: true,
      inProgressDate: null,
    });
    expect(overview.nextActionable).toBeNull();
  });

  it("prefers an actionable fixed occurrence for next action", () => {
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      now: new Date("2026-08-17T12:00:00.000Z"),
      slots: [fixedSlot, flexibleSlot],
      sessions: [],
    });

    expect(overview.nextActionable).toEqual({
      planSlotSnapshotId: "slot-fixed",
      workoutSnapshotId: "workout-1",
      scheduledDate: "2026-08-17",
    });
  });

  it("falls back to a flexible slot with remaining sessions", () => {
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      slots: [fixedSlot, flexibleSlot],
      sessions: [],
    });

    expect(overview.nextActionable).toEqual({
      planSlotSnapshotId: "slot-flex",
      workoutSnapshotId: "workout-2",
      scheduledDate: "2026-08-11",
    });
  });

  it("resets flexible progress after the local week rolls over", () => {
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      now: new Date("2026-08-18T12:00:00.000Z"),
      slots: [flexibleSlot],
      sessions: [
        session({
          id: "flex-last-week",
          workoutSnapshotId: "workout-2",
          planSlotSnapshotId: "slot-flex",
          scheduledDate: "2026-08-11",
          status: "submitted",
        }),
      ],
    });

    const slot = overview.flexibleSlots[0]!;
    expect(slot.completedThisWeek).toBe(0);
    expect(slot.targetMet).toBe(false);
  });

  it("counts local weeks using the assignment timezone", () => {
    // 2026-08-17T03:00Z is still Sunday 2026-08-16 in New York.
    const overview = buildPlanOccurrenceOverview({
      ...baseInput,
      timezone: "America/New_York",
      now: new Date("2026-08-17T03:00:00.000Z"),
      slots: [flexibleSlot],
      sessions: [
        session({
          id: "flex-sunday",
          workoutSnapshotId: "workout-2",
          planSlotSnapshotId: "slot-flex",
          scheduledDate: "2026-08-16",
          status: "submitted",
        }),
      ],
    });

    expect(overview.weekStart).toBe("2026-08-10");
    expect(overview.flexibleSlots[0]?.completedThisWeek).toBe(1);
  });
});
