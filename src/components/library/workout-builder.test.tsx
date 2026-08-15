import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkoutBuilder } from "./workout-builder";

afterEach(cleanup);

describe("WorkoutBuilder resistance", () => {
  it("edits and serializes a structured percent-1RM prescription", () => {
    render(
      <WorkoutBuilder
        action={vi.fn(async () => ({}))}
        exercises={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Squat",
            status: "active",
          },
        ]}
        workout={{
          id: "22222222-2222-4222-8222-222222222222",
          name: "Strength",
          description: null,
          version: 1,
          blocks: [
            {
              type: "straight",
              label: null,
              rounds: 1,
              items: [
                {
                  exerciseId: "11111111-1111-4111-8111-111111111111",
                  reps: 5,
                  load: null,
                  resistance: { type: "percent_1rm", percentage: 80 },
                  durationSeconds: null,
                  distanceMeters: null,
                  restSeconds: 180,
                  tempo: null,
                  notes: null,
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText("Percentage of 1RM")).toHaveValue(80);
    const graph = JSON.parse(
      (screen.getByDisplayValue(/"percent_1rm"/) as HTMLInputElement).value,
    );
    expect(graph.blocks[0].items[0]).toMatchObject({
      load: null,
      resistance: { type: "percent_1rm", percentage: 80 },
    });
  });
});
