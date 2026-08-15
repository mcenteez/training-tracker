import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssignmentTargetFields } from "@/components/assignments/assignment-target-fields";
import { buildAthleteTargetOptions } from "@/components/assignments/assignment-target-options";

afterEach(cleanup);

const teams = [
  { id: "team-1", label: "Basketball" },
  { id: "team-2", label: "Varsity Soccer" },
];
const athletes = [
  {
    id: "athlete-1",
    label: "Alex Morgan",
    description: "alex@example.com",
    keywords: ["Varsity Soccer"],
    teamIds: ["team-2"],
  },
  {
    id: "athlete-2",
    label: "Jordan Lee",
    description: "jordan@example.com",
    teamIds: ["team-1"],
  },
  {
    id: "athlete-3",
    label: "Casey Smith",
    description: "casey@example.com",
    teamIds: [],
  },
];

function renderFields() {
  render(
    <form data-testid="form">
      <AssignmentTargetFields teams={teams} athletes={athletes} />
    </form>,
  );
}

describe("AssignmentTargetFields", () => {
  it("searches and serializes multiple selected targets", () => {
    renderFields();

    fireEvent.click(screen.getByRole("button", { name: "Teams" }));
    fireEvent.click(screen.getByRole("option", { name: /Basketball/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search teams" }), {
      target: { value: "soccer" },
    });
    fireEvent.click(screen.getByRole("option", { name: /Varsity Soccer/ }));

    fireEvent.click(
      screen.getByRole("button", { name: "Individual athletes" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search individual athletes" }),
      { target: { value: "casey@example.com" } },
    );
    fireEvent.click(screen.getByRole("option", { name: /Casey Smith/ }));

    const form = screen.getByTestId("form") as HTMLFormElement;
    const data = new FormData(form);

    expect(data.getAll("teamIds")).toEqual(["team-1", "team-2"]);
    expect(data.getAll("athleteUserIds")).toEqual(["athlete-3"]);
  });

  it("filters non-athlete team members from the athlete selector", () => {
    const options = buildAthleteTargetOptions({
      members: [
        {
          userId: "manager-1",
          email: "manager@local.test",
          fullName: "Local Team Manager",
          organizationRole: "athlete",
        },
        {
          userId: "athlete-1",
          email: "athlete@local.test",
          fullName: "Local Athlete",
          organizationRole: "athlete",
        },
      ],
      teamMemberships: [
        { userId: "manager-1", teamId: "team-1", teamRole: "manager" },
        { userId: "athlete-1", teamId: "team-1", teamRole: "athlete" },
      ],
      teams: [{ id: "team-1", name: "Local Team" }],
    });

    expect(options.map((option) => option.id)).toEqual(["athlete-1"]);
  });

  it("marks athletes already included through a selected team", () => {
    renderFields();

    fireEvent.click(screen.getByRole("button", { name: "Teams" }));
    fireEvent.click(screen.getByRole("option", { name: /Basketball/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Individual athletes" }),
    );

    expect(screen.getByRole("option", { name: /Jordan Lee/ })).toBeDisabled();
    expect(
      screen.getByText("Included through selected team"),
    ).toBeInTheDocument();
  });

  it("finds athletes by team name", () => {
    renderFields();

    fireEvent.click(
      screen.getByRole("button", { name: "Individual athletes" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search individual athletes" }),
      { target: { value: "varsity soccer" } },
    );

    expect(screen.getByRole("option", { name: /Alex Morgan/ })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: /Jordan Lee/ }),
    ).not.toBeInTheDocument();
  });

  it("restores existing selections for draft editing", () => {
    render(
      <AssignmentTargetFields
        teams={teams}
        athletes={athletes}
        selectedTeamIds={["team-1"]}
        selectedAthleteIds={["athlete-1"]}
      />,
    );

    expect(screen.getByRole("button", { name: "Teams" })).toHaveTextContent(
      "1 team selected",
    );
    expect(
      screen.getByRole("button", { name: "Individual athletes" }),
    ).toHaveTextContent("1 athlete selected");
  });
});
