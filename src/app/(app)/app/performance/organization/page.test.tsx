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

function timeliness(
  input: {
    onTime?: number;
    eligible?: number;
    previousOnTime?: number;
    previousEligible?: number;
    direction?: "improved" | "declined" | "unchanged" | null;
    change?: number | null;
  } = {},
) {
  const onTime = input.onTime ?? 0;
  const eligible = input.eligible ?? 0;
  const previousOnTime = input.previousOnTime ?? 0;
  const previousEligible = input.previousEligible ?? 0;
  const current = {
    counts: {
      onTimeCompleted: onTime,
      lateCompleted: 0,
      openOverdue: Math.max(0, eligible - onTime),
      notYetDue: 0,
    },
    timelinessEligible: eligible,
    onTimeCompletionRate: eligible === 0 ? null : onTime / eligible,
    lateCompletionRate: eligible === 0 ? null : 0,
    averageCompletedLatenessMilliseconds: null,
    oldestOpenOverdueAt: null,
    athletesNeedingTimelinessAttention: 0,
    unavailableReason: eligible === 0 ? "no_due_work" : null,
  };
  const previous = {
    ...current,
    counts: {
      ...current.counts,
      onTimeCompleted: previousOnTime,
      openOverdue: Math.max(0, previousEligible - previousOnTime),
    },
    timelinessEligible: previousEligible,
    onTimeCompletionRate:
      previousEligible === 0 ? null : previousOnTime / previousEligible,
  };
  return {
    asOf: new Date("2026-08-12T12:00:00Z"),
    current,
    previous,
    trend: {
      current,
      previous,
      onTimeCompletion: {
        current: {
          numerator: onTime,
          denominator: eligible,
          rate: current.onTimeCompletionRate,
        },
        previous: {
          numerator: previousOnTime,
          denominator: previousEligible,
          rate: previous.onTimeCompletionRate,
        },
        percentagePointChange: input.change ?? null,
        direction: input.direction ?? null,
        unavailableReason:
          input.direction === null || input.direction === undefined
            ? "insufficient_history"
            : null,
      },
    },
    assignments: [],
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
        timeliness: timeliness({
          onTime: 3,
          eligible: 4,
          previousOnTime: 1,
          previousEligible: 2,
          direction: "improved",
          change: 25,
        }),
        teams: [
          {
            teamId: "team-1",
            teamName: "Junior Varsity",
            summary: summary({ rosteredAthletes: 1 }),
            timeliness: timeliness(),
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
            timeliness: timeliness({
              onTime: 3,
              eligible: 4,
              previousOnTime: 1,
              previousEligible: 2,
              direction: "improved",
              change: 25,
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
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/\+25 points · improved/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/1 improving · 0 declining · 1 unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("No due work").length).toBeGreaterThan(0);
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
      { summary: summary(), timeliness: timeliness(), teams: [] },
    ]);

    render(
      await OrganizationPerformancePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByText("No teams have been created yet."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("No due work").length).toBeGreaterThan(0);
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
