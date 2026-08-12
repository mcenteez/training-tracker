import Link from "next/link";

import { ComplianceDefinitions } from "@/components/compliance-definitions";
import { TimelinessSummary } from "@/components/timeliness-summary";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadAuthorizedTeamContext } from "@/lib/team-context";
import { hasPermission } from "@/modules/access-control/permissions";
import { getTeamComplianceDashboard } from "@/modules/assignments/db/team-compliance-queries";
import { listTeamMembersByTeamId } from "@/modules/teams/db/queries";

type TeamPerformancePageProps = {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ window?: string }>;
};

function parseWindowDays(value: string | undefined): number | null {
  return value === "90" ? 90 : value === "all" ? null : 30;
}

function dateLabel(assignment: {
  startDate: string | null;
  endDate: string | null;
  scheduledDate: string | null;
}): string {
  return assignment.scheduledDate
    ? assignment.scheduledDate
    : `${assignment.startDate} to ${assignment.endDate}`;
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

export default async function TeamPerformancePage({
  params,
  searchParams,
}: TeamPerformancePageProps) {
  const { teamId } = await params;
  const filters = await searchParams;
  const windowDays = parseWindowDays(filters.window);
  const context = await loadAuthorizedTeamContext(teamId, "results.read.all");
  const organizationId = context.membership.organizationId;
  const [members, complianceDashboard] = await withDatabase((database) =>
    Promise.all([
      listTeamMembersByTeamId(database, { organizationId, teamId }),
      getTeamComplianceDashboard(database, {
        organizationId,
        teamId,
        windowDays,
      }),
    ]),
  );
  const assignmentCompliance = complianceDashboard.assignments;
  const complianceSummary = complianceDashboard.summary;
  const dueNow =
    complianceSummary.counts.started + complianceSummary.counts.dueToday;
  const canManageTeam = hasPermission(context.access, "team.update");
  const canAssignTeam = hasPermission(context.access, "workout.assign.team");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Team Performance
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            {context.team.name}
          </CardTitle>
          <CardDescription>
            {context.membership.organizationName} - {members.length} roster
            entries
          </CardDescription>
        </CardHeader>
      </Card>

      <nav aria-label="Team workflows" className="flex flex-wrap gap-2">
        {canManageTeam ? (
          <Button asChild variant="outline">
            <Link href={`/app/teams/${teamId}`}>Manage team</Link>
          </Button>
        ) : null}
        {canAssignTeam ? (
          <Button asChild variant="outline">
            <Link href="/app/assignments">Assignments</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/app/library">Library</Link>
        </Button>
      </nav>

      <dl
        role="group"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Team compliance summary"
      >
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">Completion rate</dt>
            <dd className="font-heading text-3xl leading-snug font-medium">
              {complianceSummary.completionRate === null
                ? "No due work"
                : formatRate(complianceSummary.completionRate)}
            </dd>
            <dd className="text-sm text-muted-foreground">
              {complianceSummary.counts.completed} of{" "}
              {complianceSummary.eligibleDue} due occurrences completed
            </dd>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">
              Athletes needing attention
            </dt>
            <dd className="font-heading text-3xl leading-snug font-medium">
              {complianceSummary.athletesNeedingAttention}
            </dd>
            <dd className="text-sm text-muted-foreground">
              Unique athletes with overdue work
            </dd>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">Overdue work</dt>
            <dd className="font-heading text-3xl leading-snug font-medium">
              {complianceSummary.counts.overdue}
            </dd>
            <dd className="text-sm text-muted-foreground">
              {complianceSummary.oldestOverdueDate
                ? `Oldest due ${complianceSummary.oldestOverdueDate}`
                : "No overdue occurrences"}
            </dd>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">Due now</dt>
            <dd className="font-heading text-3xl leading-snug font-medium">
              {dueNow}
            </dd>
            <dd className="text-sm text-muted-foreground">
              {complianceSummary.counts.started} started ·{" "}
              {complianceSummary.counts.dueToday} due today
            </dd>
          </CardHeader>
        </Card>
      </dl>

      <TimelinessSummary
        timeliness={complianceDashboard.timeliness}
        label="Team timeliness summary"
      />

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Roster readiness</CardTitle>
          <CardDescription>
            Current team members and their assigned team roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length > 0 ? (
            <ul className="space-y-2.5">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2"
                >
                  <p className="text-sm font-medium">
                    {member.fullName?.trim() || member.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {member.teamRole}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No team members have been assigned yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Workout compliance</CardTitle>
          <CardDescription>
            Completed means an athlete submitted results, not that staff
            verified training quality.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            className="flex flex-wrap gap-2"
            aria-label="Compliance time window"
          >
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

          <p className="text-sm text-muted-foreground">
            {complianceSummary.counts.upcoming} upcoming occurrences in this
            window
          </p>

          {assignmentCompliance.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No published assignments cover this team yet.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {assignmentCompliance.map((assignment) => (
                <li
                  key={assignment.id}
                  className={
                    assignment.summary.counts.overdue > 0
                      ? "space-y-3 border-l-2 border-l-destructive px-4 py-4"
                      : "space-y-3 px-4 py-4"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/app/performance/teams/${teamId}/assignments/${assignment.id}?window=${windowDays ?? "all"}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {assignment.sourceName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {assignment.sourceType} - {dateLabel(assignment)} -{" "}
                        {assignment.recipientCount} recipients
                      </p>
                    </div>
                    <span className="rounded-md border px-2 py-1 text-xs font-medium capitalize">
                      {assignment.status}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">
                      {assignment.summary.completionRate === null
                        ? "No due work"
                        : `${formatRate(assignment.summary.completionRate)} complete`}
                      {" · "}
                      {assignment.summary.counts.completed} of{" "}
                      {assignment.summary.eligibleDue} due
                    </p>
                    <p className="text-muted-foreground">
                      {assignment.summary.athletesNeedingAttention} athletes
                      need attention · {assignment.summary.counts.started}{" "}
                      started · {assignment.summary.counts.dueToday} due today ·{" "}
                      {assignment.summary.counts.upcoming} upcoming
                    </p>
                    {(() => {
                      const timing =
                        complianceDashboard.timeliness.assignments.find(
                          (candidate) =>
                            candidate.assignmentId === assignment.id,
                        );
                      if (!timing) return null;
                      const comparison = timing.trend?.onTimeCompletion;
                      return (
                        <p className="text-muted-foreground">
                          On time {timing.current.counts.onTimeCompleted}/
                          {timing.current.timelinessEligible} ·{" "}
                          {comparison?.unavailableReason
                            ? "insufficient history"
                            : comparison
                              ? `${comparison.percentagePointChange! > 0 ? "+" : ""}${comparison.percentagePointChange!.toFixed(0)} points ${comparison.direction}`
                              : "no all-time trend"}
                        </p>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {assignment.latestCompletionAt
                      ? `Latest completion: ${assignment.latestCompletionAt.toLocaleString()}`
                      : "No completions in this window"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <ComplianceDefinitions windowLabel={windowLabel(windowDays)} />
        </CardContent>
      </Card>
    </main>
  );
}
