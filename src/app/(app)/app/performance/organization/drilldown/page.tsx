import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
import {
  performanceDrilldownLabel,
  performanceDrilldownSearchSchema,
  performanceDrilldownTabLabel,
  tabsForPerformanceDrilldown,
} from "@/modules/assignments/application/performance-drilldowns";
import {
  listOrganizationComplianceDrilldownFacts,
  listOrganizationTimelinessDrilldownFacts,
  listOrganizationTrainingLoadDrilldownFacts,
  type OrganizationComplianceDrilldownFact,
  type OrganizationTimelinessDrilldownFact,
  type OrganizationTrainingLoadDrilldownFact,
} from "@/modules/assignments/db/performance-drilldown-queries";

interface OrganizationDrilldownPageProps {
  searchParams: Promise<{ metric?: string; window?: string; tab?: string }>;
}

function isComplianceMetric(
  metric: string,
): metric is "completion" | "attention" | "overdue" | "dueNow" {
  return ["completion", "attention", "overdue", "dueNow"].includes(metric);
}

function isTimelinessMetric(
  metric: string,
): metric is "onTime" | "lateCompleted" {
  return metric === "onTime" || metric === "lateCompleted";
}

function isTrainingLoadMetric(
  metric: string,
): metric is "capture" | "internalLoad" | "externalWork" {
  return ["capture", "internalLoad", "externalWork"].includes(metric);
}

function complianceStatus(status: string): string {
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

function timelinessStatus(state: string): string {
  return (
    {
      onTimeCompleted: "On time",
      lateCompleted: "Completed late",
      openOverdue: "Open overdue",
      notYetDue: "Not yet due",
    }[state] ?? state
  );
}

export default async function OrganizationDrilldownPage({
  searchParams,
}: OrganizationDrilldownPageProps) {
  const context = await loadActiveAppContext();
  if (context.membership.organizationRole === "athlete") redirect("/app");
  const parsed = performanceDrilldownSearchSchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const search = parsed.data;
  const metric = search.metric;
  if (
    !isComplianceMetric(metric) &&
    !isTimelinessMetric(metric) &&
    !isTrainingLoadMetric(metric)
  ) {
    notFound();
  }

  const asOf = new Date();
  let facts:
    | OrganizationComplianceDrilldownFact[]
    | OrganizationTimelinessDrilldownFact[]
    | OrganizationTrainingLoadDrilldownFact[];
  if (isComplianceMetric(metric)) {
    facts = await withDatabase((database) =>
      listOrganizationComplianceDrilldownFacts(database, {
        organizationId: context.membership.organizationId,
        metric,
        tab: search.tab,
        windowDays: search.windowDays,
        asOf,
      }),
    );
  } else if (isTimelinessMetric(metric)) {
    facts = await withDatabase((database) =>
      listOrganizationTimelinessDrilldownFacts(database, {
        organizationId: context.membership.organizationId,
        metric,
        tab: search.tab,
        windowDays: search.windowDays,
        asOf,
      }),
    );
  } else {
    facts = await withDatabase((database) =>
      listOrganizationTrainingLoadDrilldownFacts(database, {
        organizationId: context.membership.organizationId,
        metric,
        tab: search.tab,
        windowDays: search.windowDays,
        asOf,
      }),
    );
  }
  const tabs = tabsForPerformanceDrilldown(metric);
  const windowLabel =
    search.window === "all" ? "all-time" : `${search.window}-day`;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
      <section className="space-y-2">
        <Link
          href={`/app/performance/organization?window=${search.window}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to organization performance
        </Link>
        <h1 className="text-3xl font-semibold">
          {performanceDrilldownLabel(metric)}
        </h1>
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
              href={`/app/performance/organization/drilldown?metric=${metric}&window=${search.window}&tab=${tab}`}
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
              No authorized facts match this metric and window.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Underlying facts</CardTitle>
            <CardDescription>
              Organization-only rows are direct-athlete assignments without a
              persisted team scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 md:hidden">
              {facts.map((fact) => {
                const teamName = "teamName" in fact ? fact.teamName : null;
                const status =
                  fact.metric === "compliance"
                    ? complianceStatus(fact.status)
                    : fact.metric === "timeliness"
                      ? timelinessStatus(fact.state)
                      : `${fact.captureState} capture · ${fact.externalWorkState} external work`;
                const reviewable =
                  teamName !== null &&
                  fact.sessionId !== null &&
                  (fact.metric === "trainingLoad" ||
                    (fact.metric === "compliance" &&
                      fact.status === "completed") ||
                    (fact.metric === "timeliness" &&
                      (fact.state === "onTimeCompleted" ||
                        fact.state === "lateCompleted")));
                return (
                  <article
                    key={`${fact.assignmentId}:${fact.sessionId ?? fact.scheduledDate}:${fact.athleteUserId}`}
                    className="space-y-2 rounded-md border p-3 text-sm"
                  >
                    <p className="font-medium">{fact.athleteName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fact.athleteEmail}
                    </p>
                    <p className="text-muted-foreground">
                      {teamName ?? "Organization only"} · {fact.scheduledDate} ·{" "}
                      {status}
                    </p>
                    {reviewable && fact.teamId && fact.sessionId ? (
                      <Link
                        href={`/app/performance/teams/${fact.teamId}/assignments/${fact.assignmentId}/sessions/${fact.sessionId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        Review
                      </Link>
                    ) : teamName && fact.teamId ? (
                      <Link
                        href={`/app/performance/teams/${fact.teamId}/drilldown?metric=${metric}&window=${search.window}&tab=${search.tab}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        Open team facts
                      </Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <table className="hidden w-full min-w-4xl text-left text-sm md:table">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Team scope
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Athlete
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Session/occurrence
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Facts
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {facts.map((fact) => {
                  const teamName = "teamName" in fact ? fact.teamName : null;
                  const teamId = "teamId" in fact ? fact.teamId : null;
                  const description =
                    fact.metric === "compliance"
                      ? complianceStatus(fact.status)
                      : fact.metric === "timeliness"
                        ? `${timelinessStatus(fact.state)} · due ${fact.dueAt.toLocaleString()}`
                        : `${fact.durationMinutes ?? "missing"} min · RPE ${fact.sessionRpe ?? "missing"} · internal load ${fact.internalLoad ?? "unavailable"} · ${fact.externalWorkState}`;
                  const reviewable =
                    teamId !== null &&
                    fact.sessionId !== null &&
                    (fact.metric === "trainingLoad" ||
                      (fact.metric === "compliance" &&
                        fact.status === "completed") ||
                      (fact.metric === "timeliness" &&
                        (fact.state === "onTimeCompleted" ||
                          fact.state === "lateCompleted")));
                  return (
                    <tr
                      key={`${fact.assignmentId}:${fact.sessionId ?? fact.scheduledDate}:${fact.athleteUserId}`}
                    >
                      <td className="px-3 py-3">
                        {teamName ?? "Organization only"}
                      </td>
                      <td className="px-3 py-3">
                        <span className="block font-medium">
                          {fact.athleteName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fact.athleteEmail}
                        </span>
                      </td>
                      <td className="px-3 py-3">{fact.scheduledDate}</td>
                      <td className="px-3 py-3">{description}</td>
                      <td className="px-3 py-3">
                        {reviewable && teamId && fact.sessionId ? (
                          <Link
                            href={`/app/performance/teams/${teamId}/assignments/${fact.assignmentId}/sessions/${fact.sessionId}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            Review
                          </Link>
                        ) : teamId ? (
                          <Link
                            href={`/app/performance/teams/${teamId}/drilldown?metric=${metric}&window=${search.window}&tab=${search.tab}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            Open team facts
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Organization-only assignment
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
