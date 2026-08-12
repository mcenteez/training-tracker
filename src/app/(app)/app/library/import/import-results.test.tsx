import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { LibraryImportState } from "./import-state";
import { ImportResults } from "./import-results";

afterEach(cleanup);

function state(
  overrides: Partial<LibraryImportState> = {},
): LibraryImportState {
  return {
    status: "previewed",
    diagnostics: [],
    entries: [],
    canCommit: true,
    ...overrides,
  };
}

const commitButton = <button type="submit">Import into my library</button>;

describe("ImportResults", () => {
  it("renders nothing before a file is checked", () => {
    const { container } = render(
      <ImportResults state={state({ status: "idle" })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("offers the commit button for a clean preview", () => {
    render(
      <ImportResults
        state={state({
          entries: [
            { entity: "exercise", name: "Back Squat", action: "create" },
          ],
        })}
      >
        {commitButton}
      </ImportResults>,
    );

    expect(
      screen.getByRole("button", { name: "Import into my library" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Will be created")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows errors and withholds the commit button", () => {
    render(
      <ImportResults
        state={state({
          status: "rejected",
          canCommit: false,
          diagnostics: [
            {
              severity: "error",
              entity: "workout",
              location: "workouts[0].blocks[0].items[0].exercise",
              code: "unknown_exercise",
              message: 'No exercise named "Deadlift" is defined.',
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByRole("alert", { name: "Import errors" }),
    ).toHaveTextContent('No exercise named "Deadlift" is defined.');
    expect(
      screen.queryByRole("button", { name: "Import into my library" }),
    ).not.toBeInTheDocument();
  });

  it("shows warnings without blocking the commit button", () => {
    render(
      <ImportResults
        state={state({
          diagnostics: [
            {
              severity: "warning",
              entity: "exercise",
              location: "exercises[0].name",
              code: "already_exists",
              message: '"Back Squat" already exists in your library.',
            },
          ],
          entries: [
            { entity: "exercise", name: "Back Squat", action: "skip_existing" },
            { entity: "workout", name: "Lower Body A", action: "create" },
          ],
        })}
      >
        {commitButton}
      </ImportResults>,
    );

    expect(
      screen.getByRole("button", { name: "Import into my library" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Already exists, skipped")).toBeInTheDocument();
  });

  it("summarizes what was created after a commit", () => {
    render(
      <ImportResults
        state={state({
          status: "imported",
          canCommit: false,
          created: { exercises: 2, workouts: 1, plans: 0 },
          entries: [
            { entity: "exercise", name: "Back Squat", action: "create" },
          ],
        })}
      />,
    );

    expect(screen.getByLabelText("Import results")).toHaveTextContent(
      "Imported 2 exercises, 1 workout, and 0 plans. Workouts and plans were created as drafts.",
    );
    expect(screen.getByText("Created")).toBeInTheDocument();
  });
});
