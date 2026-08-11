import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanBuilder } from "@/components/library/plan-builder";

afterEach(cleanup);

describe("PlanBuilder", () => {
  it("renders metadata fields and session controls", () => {
    render(
      <PlanBuilder
        action={vi.fn(async () => ({}))}
        workouts={[
          {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Push",
            status: "active",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Plan name")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /add session/i })[0],
    ).toBeEnabled();
  });

  it("serializes plan graph from edited fields", () => {
    render(
      <PlanBuilder
        action={vi.fn(async () => ({}))}
        workouts={[
          {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Push",
            status: "active",
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Plan name"), {
      target: { value: "In-Season Strength" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: /add session/i })[0]!,
    );

    const graphInput = document.querySelector(
      'input[name="graph"]',
    ) as HTMLInputElement;

    const graph = JSON.parse(graphInput.value) as {
      name: string;
      scheduleSlots: Array<{
        workoutId: string;
        scheduleType: string;
        dayOfWeek?: string;
        targetSessionsPerWeek?: number;
      }>;
    };

    expect(graph.name).toBe("In-Season Strength");
    expect(graph.scheduleSlots.length).toBe(1);
    expect(graph.scheduleSlots[0]?.scheduleType).toBe("fixed_day");
    expect(graph.scheduleSlots[0]?.dayOfWeek).toBe("monday");
  });

  it("switches a session to a weekly target without stale weekday data", () => {
    render(
      <PlanBuilder
        action={vi.fn(async () => ({}))}
        workouts={[
          {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Push",
            status: "active",
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /add session/i })[0]!,
    );
    fireEvent.change(screen.getByLabelText("Schedule mode"), {
      target: { value: "weekly_frequency" },
    });
    fireEvent.change(screen.getByLabelText("Sessions per week"), {
      target: { value: "3" },
    });

    const graphInput = document.querySelector(
      'input[name="graph"]',
    ) as HTMLInputElement;
    const graph = JSON.parse(graphInput.value) as {
      scheduleSlots: Array<{
        scheduleType: string;
        dayOfWeek?: string;
        targetSessionsPerWeek?: number;
      }>;
    };

    expect(graph.scheduleSlots[0]?.scheduleType).toBe("weekly_frequency");
    expect(graph.scheduleSlots[0]?.targetSessionsPerWeek).toBe(3);
    expect(graph.scheduleSlots[0]?.dayOfWeek).toBeUndefined();
  });
});
