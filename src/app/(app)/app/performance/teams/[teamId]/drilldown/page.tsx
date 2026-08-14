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
import { listTeamComplianceDrilldownFacts } from "@/modules/assignments/db/performance-drilldown-queries";

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

export default async function TeamDrilldownPage({
  params,
  searchParams,
}: TeamDrilldownPageProps) {
  const { teamId } = await params;
  const rawSearch = await searchParams;
  const parsed = performanceDrilldownSearchSchema.safeParse(rawSearch);
  if (!parsed.success) notFound();
  const search = parsed.data;
  if (!isComplianceMetric(search.metric)) {
    notFound();
  }
  const metric = search.metric as
    "completion" | "attention" | "overdue" | "dueNow";

  const context = await loadAuthorizedTeamContext(teamId, "results.read.all");
  const asOf = new Date();
  const facts = await withDatabase((database) =>
    listTeamComplianceDrilldownFacts(database, {
      organizationId: context.membership.organizationId,
      teamId,
      metric,
      tab: search.tab,
      windowDays: search.windowDays,
      asOf,
    }),
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
          {facts.length} fact{facts.length === 1 ? "" : "s"} in the{" "}
          {windowLabel} window as of {asOf.toLocaleString()}.
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

      {facts.length === 0 ? (
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
              {facts.map((fact) => (
                <article
                  key={`${fact.assignmentId}:${fact.athleteUserId}:${fact.scheduledDate}:${fact.workoutName}`}
                  className="space-y-2 rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{fact.athleteName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fact.athleteEmail}
                    </p>
                  </div>
                  <p>
                    {fact.assignmentName} · {fact.workoutName}
                  </p>
                  <p className="text-muted-foreground">
                    {fact.scheduledDate}
                    {fact.label ? ` · ${fact.label}` : ""} ·{" "}
                    {statusLabel(fact.status)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due {formatDateTime(fact.dueAt, fact.assignmentTimezone)}
                  </p>
                  {fact.sessionId && fact.status === "completed" ? (
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
                {facts.map((fact) => (
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
                    <td className="px-3 py-3">{statusLabel(fact.status)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatDateTime(fact.dueAt, fact.assignmentTimezone)}
                    </td>
                    <td className="px-3 py-3">
                      {fact.sessionId && fact.status === "completed" ? (
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
