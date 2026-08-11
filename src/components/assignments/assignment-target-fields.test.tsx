import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssignmentTargetFields } from "@/components/assignments/assignment-target-fields";

afterEach(cleanup);

describe("AssignmentTargetFields", () => {
  it("serializes each checked target under the existing field names", () => {
    render(
      <form data-testid="form">
        <AssignmentTargetFields
          teams={[
            { id: "team-1", label: "Basketball" },
            { id: "team-2", label: "Varsity" },
          ]}
          athletes={[
            { id: "athlete-1", label: "Alex Morgan" },
            { id: "athlete-2", label: "Jordan Lee" },
          ]}
        />
      </form>,
    );

    fireEvent.click(screen.getByLabelText("Basketball"));
    fireEvent.click(screen.getByLabelText("Varsity"));
    fireEvent.click(screen.getByLabelText("Jordan Lee"));

    const form = screen.getByTestId("form") as HTMLFormElement;
    const data = new FormData(form);

    expect(data.getAll("teamIds")).toEqual(["team-1", "team-2"]);
    expect(data.getAll("athleteUserIds")).toEqual(["athlete-2"]);
  });

  it("restores existing selections for draft editing", () => {
    render(
      <AssignmentTargetFields
        teams={[{ id: "team-1", label: "Basketball" }]}
        athletes={[{ id: "athlete-1", label: "Alex Morgan" }]}
        selectedTeamIds={["team-1"]}
        selectedAthleteIds={["athlete-1"]}
      />,
    );

    expect(screen.getByLabelText("Basketball")).toBeChecked();
    expect(screen.getByLabelText("Alex Morgan")).toBeChecked();
  });
});
