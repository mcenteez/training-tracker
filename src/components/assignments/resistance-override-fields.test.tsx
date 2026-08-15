import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResistanceOverrideFields } from "./resistance-override-fields";

afterEach(cleanup);

describe("ResistanceOverrideFields", () => {
  it("shows the canonical base and existing override type", () => {
    render(
      <form>
        <ResistanceOverrideFields
          baseResistance={{ type: "percent_1rm", percentage: 80 }}
          overrideResistance={{
            type: "fixed_weight",
            value: 135,
            unit: "lb",
          }}
          defaultChecked
        />
      </form>,
    );

    expect(screen.getByText(/Resistance \(base 80% 1RM\)/)).toBeVisible();
    expect(screen.getByLabelText("Weight value")).toHaveValue(135);
    expect(screen.getByRole("checkbox", { name: /Resistance/ })).toBeChecked();
  });
});
