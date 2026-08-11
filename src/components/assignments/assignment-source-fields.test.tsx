import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssignmentSourceFields } from "@/components/assignments/assignment-source-fields";

const plans = [{ id: "plan-1", name: "Preseason" }];
const workouts = [{ id: "workout-1", name: "Lower Strength" }];

afterEach(cleanup);

function renderFields() {
  render(
    <form data-testid="form">
      <AssignmentSourceFields plans={plans} workouts={workouts} />
    </form>,
  );
}

describe("AssignmentSourceFields", () => {
  it("shows only plan fields by default", () => {
    renderFields();

    expect(
      screen.getByRole("combobox", { name: "Choose a plan" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Start date")).toBeVisible();
    expect(screen.getByLabelText("End date")).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Choose a workout" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scheduled date")).not.toBeVisible();
  });

  it("submits only the selected source fields and preserves entered values", () => {
    renderFields();
    const form = screen.getByTestId("form") as HTMLFormElement;
    const planSelect = form.elements.namedItem(
      "sourcePlanId",
    ) as HTMLSelectElement;
    const workoutSelect = form.elements.namedItem(
      "sourceWorkoutId",
    ) as HTMLSelectElement;

    fireEvent.change(planSelect, {
      target: { value: "plan-1" },
    });
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(screen.getByLabelText("Assign a workout"));
    fireEvent.change(workoutSelect, {
      target: { value: "workout-1" },
    });
    fireEvent.change(screen.getByLabelText("Scheduled date"), {
      target: { value: "2026-09-02" },
    });

    const workoutData = new FormData(form);

    expect(workoutData.get("sourceType")).toBe("workout");
    expect(workoutData.get("sourceWorkoutId")).toBe("workout-1");
    expect(workoutData.get("scheduledDate")).toBe("2026-09-02");
    expect(workoutData.has("sourcePlanId")).toBe(false);
    expect(workoutData.has("startDate")).toBe(false);

    fireEvent.click(screen.getByLabelText("Assign a plan"));

    expect(planSelect).toHaveValue("plan-1");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-09-01");
  });
});
