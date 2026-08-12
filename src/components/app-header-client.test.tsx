import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/teams/team-1",
}));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div>Account menu</div> }));

import { AppHeaderClient } from "./app-header-client";

afterEach(cleanup);

describe("AppHeaderClient", () => {
  it("renders desktop and mobile navigation with the current page identified", () => {
    render(
      <AppHeaderClient
        navigationItems={[
          { href: "/app/performance/teams", label: "Team Performance" },
          { href: "/app/teams", label: "Team Management" },
          { href: "/app/library", label: "Library" },
        ]}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Primary mobile" }),
    ).toBeVisible();
    for (const link of screen.getAllByRole("link", {
      name: "Team Management",
    })) {
      expect(link).toHaveAttribute("aria-current", "page");
    }
  });
  it("renders the local persona switcher without Clerk UI", () => {
    render(<AppHeaderClient navigationItems={[]} localAuthEnabled />);

    expect(
      screen.getByRole("link", { name: "Switch persona" }),
    ).toHaveAttribute("href", "/dev/auth");
    expect(screen.queryByText("Account menu")).not.toBeInTheDocument();
  });
});
