import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  buildPlanOccurrenceOverview,
  type PlanOccurrenceStatus,
} from "@/modules/assignments/application/plan-occurrences";
import { toLocalDateString } from "@/modules/assignments/application/schedule-dates";
import {
  findLatestSessionForAthleteAssignment,
  findPublishedAssignmentForAthlete,
  listPlanSlotSnapshotsForAthleteAssignment,
  listSessionsForAthleteAssignment,
  listWorkoutsForAthleteAssignment,
} from "@/modules/assignments/db/queries";

interface AthleteAssignmentDetailPageProps {
  params: Promise<{ assignmentId: string }>;
}

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatOccurrenceDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

const statusLabels: Record<PlanOccurrenceStatus, string> = {
  available: "Due today",
  in_progress: "Started",
  submitted: "Completed",
  upcoming: "Upcoming",
  missed: "Overdue",
};

export default async function AthleteAssignmentDetailPage({
  params,
}: AthleteAssignmentDetailPageProps) {
  const { assignmentId } = await params;
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole !== "athlete") {
    redirect("/app");
  }

  const assignment = await withDatabase((database) =>
    findPublishedAssignmentForAthlete(database, {
      organizationId: context.membership.organizationId,
      athleteUserId: context.user.id,
      assignmentId,
    }),
  );

  if (!assignment) {
    notFound();
  }

  if (assignment.sourceType === "workout") {
    const [workouts, session] = await Promise.all([
      withDatabase((database) =>
        listWorkoutsForAthleteAssignment(database, {
          organizationId: context.membership.organizationId,
          assignmentId,
        }),
      ),
      withDatabase((database) =>
        findLatestSessionForAthleteAssignment(database, {
          organizationId: context.membership.organizationId,
          athleteUserId: context.user.id,
          assignmentId,
        }),
      ),
    ]);
    const workoutSnapshotId = session?.workoutSnapshotId ?? workouts[0]?.id;
    const scheduledDate =
      assignment.scheduledDate ??
      toLocalDateString(new Date(), assignment.timezone);

    if (!workoutSnapshotId) {
      notFound();
    }

    redirect(
      `/app/athlete/assignments/${assignmentId}/workouts/${workoutSnapshotId}/${scheduledDate}`,
    );
  }

  const [slots, sessions] = await Promise.all([
    withDatabase((database) =>
      listPlanSlotSnapshotsForAthleteAssignment(database, {
        organizationId: context.membership.organizationId,
        assignmentId,
        athleteUserId: context.user.id,
      }),
    ),
    withDatabase((database) =>
      listSessionsForAthleteAssignment(database, {
        organizationId: context.membership.organizationId,
        assignmentId,
        athleteUserId: context.user.id,
      }),
    ),
  ]);

  const overview =
    assignment.startDate && assignment.endDate
      ? buildPlanOccurrenceOverview({
          slots,
          sessions,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          timezone: assignment.timezone,
        })
      : null;

  const currentWeekFixed =
    overview?.fixedOccurrences.filter(
      (occurrence) =>
        occurrence.scheduledDate >= overview.weekStart &&
        occurrence.scheduledDate <= overview.weekEnd,
    ) ?? [];
  const upcomingFixed =
    overview?.fixedOccurrences.filter(
      (occurrence) => occurrence.scheduledDate > overview.weekEnd,
    ) ?? [];
  const currentWeekFlexible =
    overview?.flexibleSlots.filter(
      (slot) => !slot.targetMet || slot.inProgressDate !== null,
    ) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {assignment.sourceName}
          </h1>
          <p className="text-sm text-muted-foreground">Plan assignment</p>
        </div>

        <Button asChild variant="outline">
          <Link href="/app/athlete">Back to dashboard</Link>
        </Button>
      </section>

      {assignment.status === "canceled" ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm">
            This assignment was canceled. Your existing sessions and results
            remain available.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
          <p>Start: {assignment.startDate ?? "-"}</p>
          <p>End: {assignment.endDate ?? "-"}</p>
          <p>Published: {formatDateTime(assignment.publishedAt)}</p>
          <p>Timezone: {assignment.timezone}</p>
        </CardContent>
      </Card>

      {overview ? (
        <Card>
          <CardHeader>
            <CardTitle>This Week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentWeekFixed.length === 0 &&
            currentWeekFlexible.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No remaining workouts for this week.
              </p>
            ) : null}

            {currentWeekFixed.map((occurrence) => {
              const isNext =
                overview.nextActionable?.planSlotSnapshotId ===
                  occurrence.planSlotSnapshotId &&
                overview.nextActionable?.scheduledDate ===
                  occurrence.scheduledDate;

              return (
                <Link
                  key={`${occurrence.planSlotSnapshotId}-${occurrence.scheduledDate}`}
                  href={`/app/athlete/assignments/${assignmentId}/workouts/${occurrence.workoutSnapshotId}/${occurrence.scheduledDate}`}
                  className={`block rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/40 ${
                    isNext
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/70 bg-background/70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {occurrence.workoutName}
                        {occurrence.label ? ` · ${occurrence.label}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatOccurrenceDate(occurrence.scheduledDate)}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {statusLabels[occurrence.status]}
                      {isNext ? " · Up next" : ""}
                    </p>
                  </div>
                </Link>
              );
            })}

            {currentWeekFlexible.map((slot) => {
              const isNext =
                overview.nextActionable?.planSlotSnapshotId ===
                slot.planSlotSnapshotId;
              const linkDate = slot.inProgressDate ?? overview.today;

              return (
                <Link
                  key={slot.planSlotSnapshotId}
                  href={`/app/athlete/assignments/${assignmentId}/workouts/${slot.workoutSnapshotId}/${linkDate}`}
                  className={`block rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/40 ${
                    isNext
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/70 bg-background/70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {slot.workoutName}
                        {slot.label ? ` · ${slot.label}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {slot.targetSessionsPerWeek}x per week · any day
                      </p>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {slot.completedThisWeek} of {slot.targetSessionsPerWeek}{" "}
                      completed
                      {slot.inProgressDate ? " · In progress" : ""}
                      {isNext && !slot.inProgressDate ? " · Up next" : ""}
                    </p>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {upcomingFixed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingFixed.slice(0, 6).map((occurrence) => (
              <div
                key={`${occurrence.planSlotSnapshotId}-${occurrence.scheduledDate}`}
                className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {occurrence.workoutName}
                      {occurrence.label ? ` · ${occurrence.label}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatOccurrenceDate(occurrence.scheduledDate)}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Upcoming
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {overview && overview.completedHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Completed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.completedHistory.map((entry) => (
              <Link
                key={entry.sessionId}
                href={`/app/athlete/assignments/${assignmentId}/workouts/${entry.workoutSnapshotId}/${entry.scheduledDate}`}
                className="block rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {entry.workoutName}
                    {entry.label ? ` · ${entry.label}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatOccurrenceDate(entry.scheduledDate)}
                  </p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
