import Link from "next/link";
import { redirect } from "next/navigation";

import { ComplianceDefinitions } from "@/components/compliance-definitions";
import { TimelinessSummary } from "@/components/timeliness-summary";
import { TrainingLoadSummary } from "@/components/training-load-summary";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import { getOrganizationComplianceDashboard } from "@/modules/assignments/db/team-compliance-queries";
import { summarizeOrganizationTrainingLoad } from "@/modules/assignments/db/training-load-queries";
import { listOrganizationInvitationsByOrganizationId } from "@/modules/organizations/db/queries";
import {
  listOrganizationMembersByOrganizationId,
  listTeamMembersByOrganizationId,
  listTeamsByOrganizationId,
} from "@/modules/teams/db/queries";

type OrganizationPerformancePageProps = {
  searchParams: Promise<{ window?: string }>;
};

function parseWindowDays(value: string | undefined): number | null {
  return value === "90" ? 90 : value === "all" ? null : 30;
}

function formatRate(rate: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(rate);
}

function windowLabel(windowDays: number | null): string {
  return windowDays === null ? "all-time" : `${windowDays}-day`;
}

function teamTrendLabel(
  team: Awaited<
    ReturnType<typeof getOrganizationComplianceDashboard>
  >["teams"][number],
): string {
  if (team.timeliness.previous === null) return "No all-time trend";
  const comparison = team.timeliness.trend?.onTimeCompletion;
  if (!comparison || comparison.unavailableReason) {
    return `${team.timeliness.previous.counts.onTimeCompleted}/${team.timeliness.previous.timelinessEligible} previous · insufficient history`;
  }
  const change = comparison.percentagePointChange ?? 0;
  return `${team.timeliness.previous.counts.onTimeCompleted}/${team.timeliness.previous.timelinessEligible} previous · ${change > 0 ? "+" : ""}${change.toFixed(0)} points ${comparison.direction}`;
}

export default async function OrganizationPerformancePage({
  searchParams,
}: OrganizationPerformancePageProps) {
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole === "athlete") {
    redirect("/app");
  }

  const filters = await searchParams;
  const windowDays = parseWindowDays(filters.window);
  const { organizationId, organizationName, organizationRole } =
    context.membership;
  const asOf = new Date();
  const [
    teams,
    organizationMembers,
    teamMembers,
    invitations,
    compliance,
    loadSummary,
  ] = await withDatabase((database) =>
    Promise.all([
      listTeamsByOrganizationId(database, organizationId),
      listOrganizationMembersByOrganizationId(database, organizationId),
      listTeamMembersByOrganizationId(database, organizationId),
      listOrganizationInvitationsByOrganizationId(database, organizationId),
      getOrganizationComplianceDashboard(database, {
        organizationId,
        windowDays,
        now: asOf,
      }),
      summarizeOrganizationTrainingLoad(database, {
        organizationId,
        windowDays,
        asOf,
      }),
    ]),
  );
  const pendingInvitationCount = invitations.filter(
    (invitation) => invitation.status === "pending",
  ).length;
  const athleteCount = organizationMembers.filter(
    (member) => member.organizationRole === "athlete",
  ).length;
  const teamsNeedingAttention = compliance.teams.filter(
    (team) => team.summary.counts.overdue > 0,
  ).length;
  const sortedTeamCompliance = compliance.teams.toSorted((left, right) => {
    const attentionDifference =
      right.summary.athletesNeedingAttention -
      left.summary.athletesNeedingAttention;
    if (attentionDifference !== 0) return attentionDifference;

    const overdueDifference =
      right.summary.counts.overdue - left.summary.counts.overdue;
    if (overdueDifference !== 0) return overdueDifference;

    const rightDueNow =
      right.summary.counts.started + right.summary.counts.dueToday;
    const leftDueNow =
      left.summary.counts.started + left.summary.counts.dueToday;
    if (rightDueNow !== leftDueNow) return rightDueNow - leftDueNow;

    return left.teamName.localeCompare(right.teamName);
  });
  const teamTrendCounts = compliance.teams.reduce(
    (counts, team) => {
      const direction = team.timeliness.trend?.onTimeCompletion.direction;
      if (direction === "improved") counts.improved += 1;
      else if (direction === "declined") counts.declined += 1;
      else if (direction === null || direction === undefined)
        counts.unavailable += 1;
      return counts;
    },
    { improved: 0, declined: 0, unavailable: 0 },
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Organization Performance
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            {organizationName}
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Organization-wide workout compliance and programming coverage.
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            Organization role: {organizationRole}
          </p>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap gap-2" aria-label="Compliance time window">
        {[
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
          { value: "all", label: "All time" },
        ].map((option) => {
          const active =
            (windowDays === null && option.value === "all") ||
            String(windowDays) === option.value;
          return (
            <Button
              key={option.value}
              asChild
              size="sm"
              variant={active ? "default" : "outline"}
            >
              <Link href={`?window=${option.value}`}>{option.label}</Link>
            </Button>
          );
        })}
      </div>

      <dl
        role="group"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Organization compliance summary"
      >
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">Completion rate</dt>
            <dd className="font-heading text-3xl leading-snug font-medium">
              {compliance.summary.completionRate === null
                ? "No due work"
                : formatRate(compliance.summary.completionRate)}
            </dd>
            <dd className="text-sm text-muted-foreground">
              {compliance.summary.counts.completed} of{" "}
              {compliance.summary.eligibleDue} due scheduled workouts completed
            </dd>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">
              Teams needing attention
            </dt>
            <dd className="font-heading text-3xl leading-snug font-medium">
              {teamsNeedingAttention} of {compliance.teams.length}
            </dd>
            <dd className="text-sm text-muted-foreground">
              Teams with overdue work
            </dd>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">
              Athletes needing attention
            </dt>
            <dd className="font-heading text-3xl leading-snug font-medium">
              {compliance.summary.athletesNeedingAttention}
            </dd>
            <dd className="text-sm text-muted-foreground">
              Unique athletes with overdue work
            </dd>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">
              Programming coverage
            </dt>
            <dd className="font-heading text-3xl leading-snug font-medium">
              {compliance.summary.athleteCoverage === null
                ? "No athletes"
                : formatRate(compliance.summary.athleteCoverage)}
            </dd>
            <dd className="text-sm text-muted-foreground">
              {compliance.summary.programmedAthletes} of{" "}
              {compliance.summary.rosteredAthletes} organization athletes have
              due work
            </dd>
          </CardHeader>
        </Card>
      </dl>

      <TimelinessSummary
        timeliness={compliance.timeliness}
        label="Organization timeliness summary"
      />

      <TrainingLoadSummary
        summary={loadSummary}
        label="organization-training-load"
      />

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Team compliance</CardTitle>
          <CardDescription>
            Teams with overdue athletes appear first. Rates use each team&apos;s
            due scheduled workouts in the selected window.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {teamTrendCounts.improved} improving · {teamTrendCounts.declined}{" "}
            declining · {teamTrendCounts.unavailable} unavailable
          </p>
          {teams.length === 0 ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">No teams have been created yet.</p>
              <p className="text-muted-foreground">
                Create a team and add athletes before publishing team training.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {sortedTeamCompliance.map((team) => {
                const dueNow =
                  team.summary.counts.started + team.summary.counts.dueToday;
                return (
                  <li
                    key={team.teamId}
                    className={
                      team.summary.counts.overdue > 0
                        ? "border-l-2 border-l-destructive px-4 py-4"
                        : "px-4 py-4"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-52 space-y-1">
                        <Link
                          href={`/app/performance/teams/${team.teamId}?window=${windowDays ?? "all"}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {team.teamName}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {team.summary.athletesNeedingAttention} athletes need
                          attention · {team.summary.counts.overdue} overdue
                        </p>
                      </div>
                      <dl className="grid min-w-0 basis-full grid-cols-1 gap-x-6 gap-y-3 text-sm sm:basis-auto sm:flex-1 sm:grid-cols-4">
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Completion
                          </dt>
                          <dd className="font-semibold">
                            {team.summary.completionRate === null
                              ? "No due work"
                              : formatRate(team.summary.completionRate)}
                            <span className="ml-1 font-normal text-muted-foreground">
                              {team.summary.counts.completed}/
                              {team.summary.eligibleDue}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            On-time trend
                          </dt>
                          <dd className="font-semibold">
                            {team.timeliness.current.onTimeCompletionRate ===
                            null
                              ? "No due work"
                              : formatRate(
                                  team.timeliness.current.onTimeCompletionRate,
                                )}{" "}
                            <span className="font-normal text-muted-foreground">
                              {team.timeliness.current.counts.onTimeCompleted}/
                              {team.timeliness.current.timelinessEligible}
                            </span>
                          </dd>
                          <dd className="text-xs text-muted-foreground">
                            {teamTrendLabel(team)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Due now
                          </dt>
                          <dd className="font-semibold">{dueNow}</dd>
                          <dd className="text-xs text-muted-foreground">
                            {team.summary.counts.started} started ·{" "}
                            {team.summary.counts.dueToday} due today
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Coverage
                          </dt>
                          <dd className="font-semibold">
                            {team.summary.athleteCoverage === null
                              ? "No athletes"
                              : formatRate(team.summary.athleteCoverage)}
                            <span className="ml-1 font-normal text-muted-foreground">
                              {team.summary.programmedAthletes}/
                              {team.summary.rosteredAthletes}
                            </span>
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <ComplianceDefinitions
            windowLabel={windowLabel(windowDays)}
            showCoverage
          />
        </CardContent>
      </Card>

      <section aria-labelledby="operations-heading" className="space-y-3">
        <div>
          <h2 id="operations-heading" className="text-lg font-semibold">
            Organization operations
          </h2>
          <p className="text-sm text-muted-foreground">
            Current roster and invitation counts.
          </p>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
          {[
            ["Teams", teams.length],
            ["Athletes", athleteCount],
            ["Roster entries", teamMembers.length],
            ["Pending invitations", pendingInvitationCount],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-lg font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
