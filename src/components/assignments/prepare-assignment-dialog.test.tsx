import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/assignments/actions", () => ({
  prepareAssignmentAction: vi.fn(),
}));

import { PrepareAssignmentDialog } from "./prepare-assignment-dialog";

afterEach(cleanup);

describe("PrepareAssignmentDialog", () => {
  it("explains that preparation freezes review data without athlete visibility", () => {
    render(
      <PrepareAssignmentDialog
        assignmentId="assignment-1"
        version={1}
        recipientEstimate={12}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Prepare assignment" }));

    expect(screen.getByText(/12 resolved recipients/i)).toBeVisible();
    expect(screen.getByText(/athletes cannot see/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm preparation" }),
    ).toBeVisible();
  });
});
