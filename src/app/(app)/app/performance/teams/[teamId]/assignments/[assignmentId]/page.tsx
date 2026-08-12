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
import { findTeamAssignmentCompliance } from "@/modules/assignments/db/team-compliance-queries";

interface TeamAssignmentPerformancePageProps {
  params: Promise<{ teamId: string; assignmentId: string }>;
  searchParams: Promise<{ window?: string }>;
}

function parseWindowDays(value: string | undefined): number | null {
  return value === "90" ? 90 : value === "all" ? null : 30;
}

function formatRate(rate: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(rate);
}

function statusLabel(status: string): string {
  if (status === "assigned") return "Due today";
  if (status === "in_progress") return "Started";
  if (status === "submitted") return "Completed";
  if (status === "missed") return "Overdue";
  return "Upcoming";
}

function formatDateTime(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(value);
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "";
  const hours = Math.max(0, Math.round(milliseconds / (60 * 60 * 1000)));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}

function timelinessLabel(state: string, duration: string): string {
  if (state === "onTimeCompleted") return "On time";
  if (state === "lateCompleted") return `Completed late · ${duration}`;
  if (state === "openOverdue") return `Open overdue · ${duration}`;
  return "Not yet due";
}

function timelinessPriority(state: string | undefined): number {
  if (state === "openOverdue") return 0;
  if (state === "lateCompleted") return 1;
  if (state === "notYetDue") return 2;
  if (state === "onTimeCompleted") return 3;
  return 4;
}

export default async function TeamAssignmentPerformancePage({
  params,
  searchParams,
}: TeamAssignmentPerformancePageProps) {
  const { teamId, assignmentId } = await params;
  const filters = await searchParams;
  const windowDays = parseWindowDays(filters.window);
  const context = await loadAuthorizedTeamContext(teamId, "results.read.all");
  const assignment = await withDatabase((database) =>
    findTeamAssignmentCompliance(database, {
      organizationId: context.membership.organizationId,
      teamId,
      assignmentId,
      windowDays,
    }),
  );

  if (!assignment) notFound();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href={`/app/performance/teams/${teamId}?window=${windowDays ?? "all"}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to {context.team.name}
          </Link>
          <h1 className="text-3xl font-semibold">{assignment.sourceName}</h1>
          <p className="text-sm text-muted-foreground">
            {assignment.recipientCount} team recipients - {assignment.status}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/assignments">Open assignments</Link>
        </Button>
      </section>

      <section
        aria-label="Assignment timeliness summary"
        className="grid gap-3 sm:grid-cols-2"
      >
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>On-time completion</CardDescription>
            <CardTitle className="text-2xl">
              {assignment.timeliness.current.onTimeCompletionRate === null
                ? "No due work"
                : formatRate(
                    assignment.timeliness.current.onTimeCompletionRate,
                  )}
            </CardTitle>
            <CardDescription>
              {assignment.timeliness.current.counts.onTimeCompleted} of{" "}
              {assignment.timeliness.current.timelinessEligible} due occurrences
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Average completed lateness</CardDescription>
            <CardTitle className="text-2xl">
              {assignment.timeliness.current
                .averageCompletedLatenessMilliseconds === null
                ? "No late completions"
                : formatDuration(
                    assignment.timeliness.current
                      .averageCompletedLatenessMilliseconds,
                  )}
            </CardTitle>
            <CardDescription>
              {assignment.timeliness.current.counts.lateCompleted} completed
              late · {assignment.timeliness.current.counts.openOverdue} open
              overdue
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      {assignment.recipients.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No team recipients</CardTitle>
            <CardDescription>
              This assignment has no recipients in the selected team scope.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        assignment.recipients.map((recipient) => {
          const recipientTimeliness = assignment.timeliness.athletes.find(
            (athlete) => athlete.recipientId === recipient.id,
          );
          const occurrenceTimeliness = new Map(
            recipientTimeliness?.occurrences.map((occurrence) => [
              occurrence.occurrenceKey,
              occurrence,
            ]) ?? [],
          );
          return (
            <Card key={recipient.id}>
              <CardHeader>
                <CardTitle>
                  {recipient.fullName?.trim() || recipient.email}
                </CardTitle>
                <CardDescription>
                  {recipient.email} ·{" "}
                  {recipient.summary.completionRate === null
                    ? "No due work"
                    : `${formatRate(recipient.summary.completionRate)} complete`}{" "}
                  · {recipient.summary.counts.completed} of{" "}
                  {recipient.summary.eligibleDue} due
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {recipient.summary.counts.overdue} overdue ·{" "}
                  {recipient.summary.counts.started} started ·{" "}
                  {recipient.summary.counts.dueToday} due today ·{" "}
                  {recipient.summary.counts.upcoming} upcoming
                </p>
                <p className="text-sm text-muted-foreground">
                  {recipientTimeliness?.current.counts.onTimeCompleted ?? 0} of{" "}
                  {recipientTimeliness?.current.timelinessEligible ?? 0} on time
                  · {recipientTimeliness?.current.counts.lateCompleted ?? 0}{" "}
                  late · {recipientTimeliness?.current.counts.openOverdue ?? 0}{" "}
                  open overdue
                </p>
                {recipient.occurrences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No occurrences fall within this time window.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-xl text-left text-sm">
                      <thead className="border-b text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-2 py-2 font-medium">
                            Date
                          </th>
                          <th scope="col" className="px-2 py-2 font-medium">
                            Workout
                          </th>
                          <th scope="col" className="px-2 py-2 font-medium">
                            Status
                          </th>
                          <th scope="col" className="px-2 py-2 font-medium">
                            Due
                          </th>
                          <th
                            scope="col"
                            className="px-2 py-2 text-right font-medium"
                          >
                            Result
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {recipient.occurrences
                          .toSorted(
                            (left, right) =>
                              timelinessPriority(
                                occurrenceTimeliness.get(left.key)?.state,
                              ) -
                                timelinessPriority(
                                  occurrenceTimeliness.get(right.key)?.state,
                                ) ||
                              left.scheduledDate.localeCompare(
                                right.scheduledDate,
                              ),
                          )
                          .map((occurrence) => {
                            const timing = occurrenceTimeliness.get(
                              occurrence.key,
                            );
                            const duration = formatDuration(
                              timing?.latenessMilliseconds ??
                                timing?.overdueMilliseconds ??
                                null,
                            );
                            return (
                              <tr key={occurrence.key}>
                                <td className="px-2 py-2">
                                  {occurrence.scheduledDate}
                                </td>
                                <td className="px-2 py-2">
                                  {occurrence.workoutName}
                                  {occurrence.label ? (
                                    <span className="block text-xs text-muted-foreground">
                                      {occurrence.label}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-2 py-2">
                                  {statusLabel(occurrence.status)}
                                  {timing ? (
                                    <span className="block text-xs text-muted-foreground">
                                      {timelinessLabel(timing.state, duration)}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-2 py-2 text-xs text-muted-foreground">
                                  {occurrence.dueAt
                                    ? formatDateTime(
                                        occurrence.dueAt,
                                        assignment.timezone,
                                      )
                                    : "Historical · no deadline"}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  {occurrence.status === "submitted" &&
                                  occurrence.sessionId ? (
                                    <Link
                                      href={`/app/performance/teams/${teamId}/assignments/${assignmentId}/sessions/${occurrence.sessionId}`}
                                      className="font-medium underline-offset-4 hover:underline"
                                    >
                                      Review
                                    </Link>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      None
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </main>
  );
}
