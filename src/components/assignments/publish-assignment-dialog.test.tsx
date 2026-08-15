import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/assignments/actions", () => ({
  publishAssignmentAction: vi.fn(),
}));

import { PublishAssignmentDialog } from "@/components/assignments/publish-assignment-dialog";

afterEach(cleanup);

describe("PublishAssignmentDialog", () => {
  it("explains publication consequences before confirmation", () => {
    render(
      <PublishAssignmentDialog
        assignmentId="assignment-1"
        version={1}
        recipientEstimate={24}
      />,
    );

    expect(
      screen.queryByText(/effective prescriptions/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish Assignment" }));

    expect(screen.getByText(/24 unique athletes/i)).toBeVisible();
    expect(screen.getByText(/effective prescriptions/i)).toBeVisible();
    expect(screen.getByText(/athletes will be able to see/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm Publication" }),
    ).toBeVisible();
  });
});
