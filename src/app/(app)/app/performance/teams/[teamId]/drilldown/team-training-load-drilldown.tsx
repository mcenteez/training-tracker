import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  performanceDrilldownLabel,
  performanceDrilldownTabLabel,
  tabsForPerformanceDrilldown,
  type PerformanceDrilldownMetric,
  type PerformanceDrilldownTab,
} from "@/modules/assignments/application/performance-drilldowns";
import type { TeamTrainingLoadDrilldownFact } from "@/modules/assignments/db/performance-drilldown-queries";

export function TeamTrainingLoadDrilldown({
  teamId,
  teamName,
  metric,
  tab,
  window,
  facts,
  asOf,
}: {
  teamId: string;
  teamName: string;
  metric: Extract<
    PerformanceDrilldownMetric,
    "capture" | "internalLoad" | "externalWork"
  >;
  tab: PerformanceDrilldownTab;
  window: "30" | "90" | "all";
  facts: TeamTrainingLoadDrilldownFact[];
  asOf: Date;
}) {
  const metricLabel = performanceDrilldownLabel(metric);
  const tabs = tabsForPerformanceDrilldown(metric);
  const windowLabel = window === "all" ? "all-time" : `${window}-day`;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
      <section className="space-y-2">
        <Link
          href={`/app/performance/teams/${teamId}?window=${window}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to {teamName}
        </Link>
        <h1 className="text-3xl font-semibold">{metricLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {facts.length} submitted session{facts.length === 1 ? "" : "s"} in the{" "}
          {windowLabel} window as of {asOf.toLocaleString()}.
        </p>
      </section>

      <nav aria-label="Training load filters" className="flex flex-wrap gap-2">
        {tabs.map((candidate) => (
          <Button
            key={candidate}
            asChild
            size="sm"
            variant={candidate === tab ? "default" : "outline"}
          >
            <Link
              href={`/app/performance/teams/${teamId}/drilldown?metric=${metric}&window=${window}&tab=${candidate}`}
            >
              {performanceDrilldownTabLabel(candidate)}
            </Link>
          </Button>
        ))}
      </nav>

      {facts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No matching sessions</CardTitle>
            <CardDescription>
              No submitted sessions match this training-load state in the
              selected window.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Underlying submitted sessions</CardTitle>
            <CardDescription>
              Values are descriptive raw session facts. Missing capture and
              unmeasurable work do not count as zero work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 md:hidden">
              {facts.map((fact) => (
                <article
                  key={fact.sessionId}
                  className="space-y-2 rounded-md border p-3 text-sm"
                >
                  <p className="font-medium">{fact.athleteName}</p>
                  <p className="text-xs text-muted-foreground">
                    {fact.athleteEmail}
                  </p>
                  <p>{fact.scheduledDate}</p>
                  <p>
                    Duration {fact.durationMinutes ?? "missing"} min · RPE{" "}
                    {fact.sessionRpe ?? "missing"} · internal load{" "}
                    {fact.internalLoad ?? "unavailable"}
                  </p>
                  <p className="text-muted-foreground">
                    External work: {fact.externalWorkState};{" "}
                    {fact.completedMeasurableRowCount} of{" "}
                    {fact.completedRowCount} result rows measurable
                  </p>
                  <Link
                    href={`/app/performance/teams/${teamId}/assignments/${fact.assignmentId}/sessions/${fact.sessionId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    Review
                  </Link>
                </article>
              ))}
            </div>
            <table className="hidden w-full min-w-4xl text-left text-sm md:table">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Athlete
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Session
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Capture
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    External work
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {facts.map((fact) => (
                  <tr key={fact.sessionId}>
                    <td className="px-3 py-3">
                      <span className="block font-medium">
                        {fact.athleteName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fact.athleteEmail}
                      </span>
                    </td>
                    <td className="px-3 py-3">{fact.scheduledDate}</td>
                    <td className="px-3 py-3">
                      {fact.durationMinutes ?? "missing"} min · RPE{" "}
                      {fact.sessionRpe ?? "missing"}
                      <span className="block text-xs text-muted-foreground">
                        Internal load {fact.internalLoad ?? "unavailable"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {fact.externalWorkState}
                      <span className="block text-xs text-muted-foreground">
                        {fact.completedVolumeKg === null
                          ? `${fact.completedMeasurableRowCount} of ${fact.completedRowCount} result rows measurable`
                          : `${fact.completedVolumeKg.toFixed(1)} kg completed of ${fact.prescribedVolumeKg?.toFixed(1)} kg prescribed`}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/app/performance/teams/${teamId}/assignments/${fact.assignmentId}/sessions/${fact.sessionId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        Review
                      </Link>
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
