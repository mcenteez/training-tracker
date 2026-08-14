import Link from "next/link";
import { notFound } from "next/navigation";

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
import {
  performanceDrilldownLabel,
  performanceDrilldownSearchSchema,
  performanceDrilldownTabLabel,
  tabsForPerformanceDrilldown,
} from "@/modules/assignments/application/performance-drilldowns";
import {
  listTeamComplianceDrilldownFacts,
  listTeamTrainingLoadDrilldownFacts,
  listTeamTimelinessDrilldownFacts,
  type TeamComplianceDrilldownFact,
  type TeamTimelinessDrilldownFact,
} from "@/modules/assignments/db/performance-drilldown-queries";
import { TeamTrainingLoadDrilldown } from "./team-training-load-drilldown";

interface TeamDrilldownPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ metric?: string; window?: string; tab?: string }>;
}

function isComplianceMetric(
  metric: string,
): metric is "completion" | "attention" | "overdue" | "dueNow" {
  return (
    metric === "completion" ||
    metric === "attention" ||
    metric === "overdue" ||
    metric === "dueNow"
  );
}

function isTimelinessMetric(
  metric: string,
): metric is "onTime" | "lateCompleted" {
  return metric === "onTime" || metric === "lateCompleted";
}

function isTrainingLoadMetric(
  metric: string,
): metric is "capture" | "internalLoad" | "externalWork" {
  return (
    metric === "capture" ||
    metric === "internalLoad" ||
    metric === "externalWork"
  );
}

function formatDateTime(value: Date | null, timezone: string): string {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
}

function statusLabel(status: string): string {
  return (
    {
      completed: "Completed",
      overdue: "Overdue",
      started: "Started",
      dueToday: "Due today",
      upcoming: "Upcoming",
    }[status] ?? status
  );
}

function timelinessLabel(state: string): string {
  return (
    {
      onTimeCompleted: "On time",
      lateCompleted: "Completed late",
      openOverdue: "Open overdue",
      notYetDue: "Not yet due",
    }[state] ?? state
  );
}

function formatDuration(milliseconds: number | null): string | null {
  if (milliseconds === null) return null;
  const hours = Math.max(0, Math.round(milliseconds / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function OccurrenceFactDetails({
  fact,
}: {
  fact: TeamComplianceDrilldownFact | TeamTimelinessDrilldownFact;
}) {
  const isTimeliness = fact.metric === "timeliness";
  const membership =
    fact.metric === "compliance" && fact.status !== "upcoming"
      ? "Included in this metric's eligible-due denominator."
      : "Included in this metric's timeliness-eligible cohort.";
  const duration = isTimeliness
    ? formatDuration(fact.latenessMilliseconds ?? fact.overdueMilliseconds)
    : null;
  return (
    <details className="rounded-md border border-border/70 p-3 text-xs">
      <summary className="cursor-pointer font-medium">
        Raw occurrence facts
      </summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Metric membership</dt>
          <dd>{membership}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Occurrence status</dt>
          <dd>
            {isTimeliness
              ? timelinessLabel(fact.state)
              : statusLabel(fact.status)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Scheduled date</dt>
          <dd>{fact.scheduledDate}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Due instant</dt>
          <dd>{formatDateTime(fact.dueAt, fact.assignmentTimezone)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">First submission</dt>
          <dd>
            {fact.submittedAt
              ? formatDateTime(fact.submittedAt, fact.assignmentTimezone)
              : "Not submitted"}
          </dd>
        </div>
        {isTimeliness && duration ? (
          <div>
            <dt className="text-muted-foreground">Timing difference</dt>
            <dd>{duration}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

export default async function TeamDrilldownPage({
  params,
  searchParams,
}: TeamDrilldownPageProps) {
  const { teamId } = await params;
  const rawSearch = await searchParams;
  const parsed = performanceDrilldownSearchSchema.safeParse(rawSearch);
  if (!parsed.success) notFound();
  const search = parsed.data;
  if (
    !isComplianceMetric(search.metric) &&
    !isTimelinessMetric(search.metric) &&
    !isTrainingLoadMetric(search.metric)
  ) {
    notFound();
  }
  const metric = search.metric;

  const context = await loadAuthorizedTeamContext(teamId, "results.read.all");
  const asOf = new Date();
  if (isTrainingLoadMetric(metric)) {
    const facts = await withDatabase((database) =>
      listTeamTrainingLoadDrilldownFacts(database, {
        organizationId: context.membership.organizationId,
        teamId,
        metric,
        tab: search.tab,
        windowDays: search.windowDays,
        asOf,
      }),
    );
    return (
      <TeamTrainingLoadDrilldown
        teamId={teamId}
        teamName={context.team.name}
        metric={metric}
        tab={search.tab}
        window={search.window}
        facts={facts}
        asOf={asOf}
      />
    );
  }
  let facts: TeamComplianceDrilldownFact[] | TeamTimelinessDrilldownFact[];
  if (isComplianceMetric(metric)) {
    facts = await withDatabase((database) =>
      listTeamComplianceDrilldownFacts(database, {
        organizationId: context.membership.organizationId,
        teamId,
        metric,
        tab: search.tab,
        windowDays: search.windowDays,
        asOf,
      }),
    );
  } else {
    facts = await withDatabase((database) =>
      listTeamTimelinessDrilldownFacts(database, {
        organizationId: context.membership.organizationId,
        teamId,
        metric,
        tab: search.tab,
        windowDays: search.windowDays,
        asOf,
      }),
    );
  }
  const rows = facts.map((fact) =>
    fact.metric === "compliance"
      ? {
          ...fact,
          displayStatus: statusLabel(fact.status),
          duration: null,
          reviewable: fact.status === "completed",
        }
      : {
          ...fact,
          displayStatus: timelinessLabel(fact.state),
          duration: formatDuration(
            fact.latenessMilliseconds ?? fact.overdueMilliseconds,
          ),
          reviewable:
            fact.state === "onTimeCompleted" || fact.state === "lateCompleted",
        },
  );
  const windowLabel =
    search.window === "all" ? "all-time" : `${search.window}-day`;
  const metricLabel = performanceDrilldownLabel(metric);
  const tabs = tabsForPerformanceDrilldown(metric);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
      <section className="space-y-2">
        <Link
          href={`/app/performance/teams/${teamId}?window=${search.window}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to {context.team.name}
        </Link>
        <h1 className="text-3xl font-semibold">{metricLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} fact{rows.length === 1 ? "" : "s"} in the {windowLabel}{" "}
          window as of {asOf.toLocaleString()}.
        </p>
      </section>

      <nav aria-label="Drill-down filters" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab}
            asChild
            size="sm"
            variant={tab === search.tab ? "default" : "outline"}
          >
            <Link
              href={`/app/performance/teams/${teamId}/drilldown?metric=${metric}&window=${search.window}&tab=${tab}`}
            >
              {performanceDrilldownTabLabel(tab)}
            </Link>
          </Button>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No matching facts</CardTitle>
            <CardDescription>
              No {metricLabel.toLowerCase()} were found for this team and
              window.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Underlying occurrences</CardTitle>
            <CardDescription>
              Each row is an authorized occurrence that contributes to this
              metric.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 md:hidden">
              {rows.map((fact) => (
                <article
                  key={`${fact.assignmentId}:${fact.athleteUserId}:${fact.scheduledDate}:${fact.workoutName}`}
                  className="min-w-0 space-y-2 rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{fact.athleteName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fact.athleteEmail}
                    </p>
                  </div>
                  <p className="break-words">
                    {fact.assignmentName} · {fact.workoutName}
                  </p>
                  <p className="text-muted-foreground">
                    {fact.scheduledDate}
                    {fact.label ? ` · ${fact.label}` : ""} ·{" "}
                    {fact.displayStatus}
                    {fact.duration ? ` · ${fact.duration}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due {formatDateTime(fact.dueAt, fact.assignmentTimezone)}
                  </p>
                  <OccurrenceFactDetails fact={fact} />
                  {fact.sessionId && fact.reviewable ? (
                    <Link
                      href={`/app/performance/teams/${teamId}/assignments/${fact.assignmentId}/sessions/${fact.sessionId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      Review
                    </Link>
                  ) : (
                    <Link
                      href={`/app/performance/teams/${teamId}/assignments/${fact.assignmentId}?window=${search.window}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      Assignment
                    </Link>
                  )}
                </article>
              ))}
            </div>
            <table className="hidden w-full min-w-3xl text-left text-sm md:table">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Athlete
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Assignment
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Occurrence
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Due
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((fact) => (
                  <tr
                    key={`${fact.assignmentId}:${fact.athleteUserId}:${fact.scheduledDate}:${fact.workoutName}`}
                  >
                    <td className="px-3 py-3">
                      <span className="block font-medium">
                        {fact.athleteName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fact.athleteEmail}
                      </span>
                    </td>
                    <td className="px-3 py-3">{fact.assignmentName}</td>
                    <td className="px-3 py-3">
                      <span className="block">{fact.workoutName}</span>
                      <span className="text-xs text-muted-foreground">
                        {fact.scheduledDate}
                        {fact.label ? ` · ${fact.label}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {fact.displayStatus}
                      {fact.duration ? (
                        <span className="block text-xs text-muted-foreground">
                          {fact.duration}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatDateTime(fact.dueAt, fact.assignmentTimezone)}
                    </td>
                    <td className="px-3 py-3">
                      {fact.sessionId && fact.reviewable ? (
                        <Link
                          href={`/app/performance/teams/${teamId}/assignments/${fact.assignmentId}/sessions/${fact.sessionId}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          Review
                        </Link>
                      ) : (
                        <Link
                          href={`/app/performance/teams/${teamId}/assignments/${fact.assignmentId}?window=${search.window}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          Assignment
                        </Link>
                      )}
                      <div className="mt-2">
                        <OccurrenceFactDetails fact={fact} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
