import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/teams/[teamId]/actions", () => ({
  updateTeamMemberAction: vi.fn(),
}));

import { UpdateTeamMemberRoleDialog } from "./update-team-member-role-dialog";

afterEach(cleanup);

describe("UpdateTeamMemberRoleDialog", () => {
  it("requires review before submitting a changed Team role", () => {
    render(
      <UpdateTeamMemberRoleDialog
        teamId="team-1"
        userId="user-1"
        displayName="Jordan Lee"
        currentRole="athlete"
      />,
    );

    const reviewButton = screen.getByRole("button", { name: "Review role" });
    expect(reviewButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Team role for Jordan Lee"), {
      target: { value: "manager" },
    });
    fireEvent.click(reviewButton);

    expect(screen.getByText(/from athlete to manager/i)).toBeVisible();
    expect(
      screen.getByText(/organization role.*remain unchanged/i),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm role change" }),
    ).toBeVisible();
  });
});
