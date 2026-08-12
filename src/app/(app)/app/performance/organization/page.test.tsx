import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadActiveAppContextMock, redirectMock, withDatabaseMock } = vi.hoisted(
  () => ({
    loadActiveAppContextMock: vi.fn(),
    redirectMock: vi.fn(),
    withDatabaseMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/db/client", () => ({ withDatabase: withDatabaseMock }));
vi.mock("@/lib/app-context", () => ({
  loadActiveAppContext: loadActiveAppContextMock,
}));

import OrganizationPerformancePage from "./page";

function summary(
  overrides: Partial<{
    completed: number;
    overdue: number;
    started: number;
    dueToday: number;
    eligibleDue: number;
    completionRate: number | null;
    athletesNeedingAttention: number;
    programmedAthletes: number;
    rosteredAthletes: number;
    athleteCoverage: number | null;
  }> = {},
) {
  return {
    counts: {
      completed: overrides.completed ?? 0,
      overdue: overrides.overdue ?? 0,
      started: overrides.started ?? 0,
      dueToday: overrides.dueToday ?? 0,
      upcoming: 0,
    },
    eligibleDue: overrides.eligibleDue ?? 0,
    completionRate: overrides.completionRate ?? null,
    outstandingRate: null,
    athletesNeedingAttention: overrides.athletesNeedingAttention ?? 0,
    programmedAthletes: overrides.programmedAthletes ?? 0,
    rosteredAthletes: overrides.rosteredAthletes ?? 0,
    athleteCoverage: overrides.athleteCoverage ?? null,
    engagedAthletes: 0,
    athletesWithEligibleDue: 0,
    engagementRate: null,
    oldestOverdueDate: null,
  };
}

describe("organization performance page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    loadActiveAppContextMock.mockReset();
    redirectMock.mockReset();
    withDatabaseMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    loadActiveAppContextMock.mockResolvedValue({
      membership: {
        organizationId: "organization-1",
        organizationName: "North High",
        organizationRole: "viewer",
      },
    });
  });

  it("shows read-only organization KPIs and prioritizes teams needing attention", async () => {
    withDatabaseMock.mockResolvedValue([
      [
        { id: "team-1", name: "Junior Varsity" },
        { id: "team-2", name: "Varsity" },
      ],
      [
        { organizationRole: "athlete" },
        { organizationRole: "athlete" },
        { organizationRole: "athlete" },
      ],
      [{ teamId: "team-1" }, { teamId: "team-2" }],
      [{ status: "pending" }],
      {
        summary: summary({
          completed: 2,
          overdue: 2,
          eligibleDue: 4,
          completionRate: 0.5,
          athletesNeedingAttention: 1,
          programmedAthletes: 2,
          rosteredAthletes: 3,
          athleteCoverage: 2 / 3,
        }),
        teams: [
          {
            teamId: "team-1",
            teamName: "Junior Varsity",
            summary: summary({ rosteredAthletes: 1 }),
          },
          {
            teamId: "team-2",
            teamName: "Varsity",
            summary: summary({
              completed: 2,
              overdue: 2,
              started: 1,
              dueToday: 1,
              eligibleDue: 6,
              completionRate: 1 / 3,
              athletesNeedingAttention: 1,
              programmedAthletes: 2,
              rosteredAthletes: 2,
              athleteCoverage: 1,
            }),
          },
        ],
      },
    ]);

    render(
      await OrganizationPerformancePage({
        searchParams: Promise.resolve({ window: "90" }),
      }),
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(
      screen.getByText("2 of 4 due occurrences completed"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("No due work")).toBeInTheDocument();
    const teamLinks = screen
      .getAllByRole("link")
      .filter((link) =>
        link.getAttribute("href")?.startsWith("/app/performance/teams/"),
      );
    expect(teamLinks.map((link) => link.textContent)).toEqual([
      "Varsity",
      "Junior Varsity",
    ]);
    expect(teamLinks[0]).toHaveAttribute(
      "href",
      "/app/performance/teams/team-2?window=90",
    );
  });

  it("shows setup guidance when the organization has no teams", async () => {
    withDatabaseMock.mockResolvedValue([
      [],
      [],
      [],
      [],
      { summary: summary(), teams: [] },
    ]);

    render(
      await OrganizationPerformancePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByText("No teams have been created yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("No due work")).toBeInTheDocument();
  });

  it("redirects athletes away from organization performance", async () => {
    loadActiveAppContextMock.mockResolvedValue({
      membership: {
        organizationId: "organization-1",
        organizationName: "North High",
        organizationRole: "athlete",
      },
    });

    await expect(
      OrganizationPerformancePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/app");
    expect(withDatabaseMock).not.toHaveBeenCalled();
  });
});
