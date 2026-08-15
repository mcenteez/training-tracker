import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  loadValue: null,
  loadUnit: null,
  resistance: null,
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: null,
  tempo: null,
  notes: null,
};

describe("AthleteWorkoutResultFields", () => {
  it("shows prescribed targets with completion and an optional actuals drawer", () => {
    render(<AthleteWorkoutResultFields item={item} disabled={false} />);

    expect(screen.getByText("Target")).toBeVisible();
    expect(screen.getByText("Reps 10")).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete" })).toBeVisible();
    expect(screen.getByText("Actuals and notes")).toBeVisible();
    expect(
      screen.getByText("Actuals and notes").closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("toggles completion for one exercise without affecting the others", async () => {
    render(
      <div>
        <AthleteWorkoutResultFields item={item} disabled={false} />
        <AthleteWorkoutResultFields
          item={{ ...item, id: "item-2", exerciseName: "Squat" }}
          disabled={false}
        />
      </div>,
    );

    const firstButton = screen.getAllByRole("button", { name: "Complete" })[0];
    fireEvent.click(firstButton);

    expect(screen.getByRole("button", { name: "Completed" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete" })).toBeVisible();
  });

  it("keeps the actuals drawer open when saved actuals exist", () => {
    render(
      <AthleteWorkoutResultFields
        item={{
          ...item,
        }}
        result={{
          completedAt: new Date("2026-08-11T12:00:00.000Z"),
          itemSnapshotId: item.id,
          roundNumber: 1,
          reps: 12,
          load: null,
          loadValue: null,
          loadUnit: null,
          normalizedLoadKg: null,
          resistance: null,
          durationSeconds: null,
          distanceMeters: null,
          notes: "Moved well",
        }}
        disabled={false}
      />,
    );

    expect(screen.getByLabelText("Actual reps")).toHaveValue("12");
    expect(screen.getByLabelText("Notes")).toHaveValue("Moved well");
    expect(screen.getByRole("button", { name: "Completed" })).toBeVisible();
  });

  it("falls back to completion and notes when no metrics are prescribed", () => {
    const result: AthleteSessionResultItem = {
      completedAt: new Date("2026-08-11T12:00:00.000Z"),
      itemSnapshotId: item.id,
      roundNumber: 1,
      reps: null,
      load: null,
      loadValue: null,
      loadUnit: null,
      normalizedLoadKg: null,
      resistance: null,
      durationSeconds: null,
      distanceMeters: null,
      notes: "Felt good",
    };

    render(
      <AthleteWorkoutResultFields
        item={{
          ...item,
          reps: null,
          load: null,
          durationSeconds: null,
          distanceMeters: null,
        }}
        result={result}
        disabled={false}
      />,
    );

    expect(screen.queryByText("Actuals and notes")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toHaveValue("Felt good");
    expect(screen.getByRole("button", { name: "Completed" })).toBeVisible();
  });

  it("does not confirm a fixed-weight prescription as the athlete result", () => {
    render(
      <AthleteWorkoutResultFields
        item={{
          ...item,
          load: "135 lb",
          loadValue: "135",
          loadUnit: "lb",
        }}
        disabled={false}
      />,
    );

    expect(screen.getByText("Resistance 135 lb")).toBeVisible();
    expect(screen.getByLabelText("Resistance used type")).toHaveTextContent(
      "Not recorded",
    );
    expect(screen.queryByLabelText("Resistance used weight value")).toBeNull();
  });

  it("keeps legacy non-measurable prescriptions readable", () => {
    render(
      <AthleteWorkoutResultFields
        item={{ ...item, load: "bodyweight" }}
        disabled={false}
      />,
    );

    expect(screen.getByText("Resistance bodyweight")).toBeVisible();
    expect(screen.getByLabelText("Resistance used type")).toHaveTextContent(
      "Not recorded",
    );
  });

  it("disables measurable controls when the session is not editable", () => {
    render(
      <AthleteWorkoutResultFields
        item={{
          ...item,
          load: "60 kg",
          loadValue: "60",
          loadUnit: "kg",
        }}
        disabled
      />,
    );

    expect(screen.getByLabelText("Resistance used type")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Complete" })).toBeDisabled();
  });
});
