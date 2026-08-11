import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AthleteWorkoutResultFields } from "@/components/assignments/athlete-workout-result-fields";
import type {
  AthleteSessionResultItem,
  AthleteWorkoutItemSnapshot,
} from "@/modules/assignments/db/queries";

afterEach(cleanup);

const item: AthleteWorkoutItemSnapshot = {
  id: "item-1",
  exerciseName: "Bench Press",
  blockLabel: "Lift",
  blockPosition: 0,
  itemPosition: 0,
  reps: 10,
  load: null,
  durationSeconds: null,
  distanceMeters: null,
  notes: null,
};

describe("AthleteWorkoutResultFields", () => {
  it("shows only prescribed metrics plus notes", () => {
    render(<AthleteWorkoutResultFields item={item} disabled={false} />);

    expect(screen.getByLabelText("Reps")).toHaveValue("10");
    expect(screen.queryByLabelText("Load")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Duration Seconds")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Distance Meters")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeVisible();
  });

  it("shows each prescribed conditioning metric", () => {
    render(
      <AthleteWorkoutResultFields
        item={{
          ...item,
          reps: null,
          durationSeconds: 60,
          distanceMeters: 400,
        }}
        disabled={false}
      />,
    );

    expect(screen.queryByLabelText("Reps")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Duration Seconds")).toHaveValue("60");
    expect(screen.getByLabelText("Distance Meters")).toHaveValue("400");
  });

  it("keeps a field visible when it contains a saved result", () => {
    const result: AthleteSessionResultItem = {
      itemSnapshotId: item.id,
      roundNumber: 1,
      reps: null,
      load: "135 lb",
      durationSeconds: null,
      distanceMeters: null,
      notes: null,
    };

    render(
      <AthleteWorkoutResultFields
        item={{ ...item, reps: null }}
        result={result}
        disabled={false}
      />,
    );

    expect(screen.getByLabelText("Load")).toHaveValue("135 lb");
  });
});
