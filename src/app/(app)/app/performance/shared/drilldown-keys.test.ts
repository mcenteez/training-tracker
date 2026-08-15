import { describe, expect, it } from "vitest";

import { buildOccurrenceRowKey } from "./drilldown-keys";

describe("buildOccurrenceRowKey", () => {
  it("keeps rows unique when assignment, athlete, date, and workout overlap", () => {
    const base = {
      assignmentId: "assignment-1",
      athleteUserId: "athlete-1",
      scheduledDate: "2026-08-01",
      workoutName: "Lower body",
      label: null,
      sessionId: null,
    };

    const sameWorkoutDifferentLabel = {
      ...base,
      label: "AM",
    };

    const differentWorkout = {
      ...base,
      workoutName: "Upper body",
      label: null,
    };

    expect(buildOccurrenceRowKey(base)).not.toBe(
      buildOccurrenceRowKey(sameWorkoutDifferentLabel),
    );
    expect(buildOccurrenceRowKey(base)).not.toBe(
      buildOccurrenceRowKey(differentWorkout),
    );
    expect(buildOccurrenceRowKey(base)).toBe(buildOccurrenceRowKey(base));
  });
});
