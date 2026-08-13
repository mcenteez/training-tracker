import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AthleteWorkoutResultFields } from "@/components/assignments/athlete-workout-result-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  buildPlanOccurrenceOverview,
  type PlanOccurrenceStatus,
} from "@/modules/assignments/application/plan-occurrences";
import { compareDates } from "@/modules/assignments/application/schedule-dates";
import {
  findPublishedAssignmentForAthlete,
  listPlanSlotSnapshotsForAthleteAssignment,
  listSessionResultsForAthleteAssignment,
  listSessionsForAthleteAssignment,
  listWorkoutItemsForSnapshot,
  listWorkoutsForAthleteAssignment,
} from "@/modules/assignments/db/queries";

import {
  autosaveWorkoutOccurrenceAction,
  resetWorkoutOccurrenceAction,
  startWorkoutOccurrenceAction,
  submitWorkoutOccurrenceAction,
} from "./actions";

interface WorkoutOccurrencePageProps {
  params: Promise<{
    assignmentId: string;
    workoutSnapshotId: string;
    scheduledDate: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function formatOccurrenceDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function readFlag(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): boolean {
  const value = searchParams[key];
  return (Array.isArray(value) ? value[0] : value) === "1";
}

const errorCopy: Record<string, string> = {
  weekly_target_met: "You have already met the weekly target for this workout.",
  outside_week:
    "Flexible workouts can only be started during the current week.",
  wrong_weekday: "This workout is scheduled for a different day of the week.",
  outside_schedule: "This workout date is outside the assignment schedule.",
  late_entry_closed:
    "The seven-day late-entry window for this workout has closed.",
  not_yet_available: "This workout is not available to start yet.",
  already_submitted: "This workout was already completed and cannot change.",
  version_conflict:
    "This workout was updated somewhere else. Review it and try again.",
  assignment_session_action_failed: "Unable to complete that session action.",
};

export default async function WorkoutOccurrencePage({
  params,
  searchParams,
}: WorkoutOccurrencePageProps) {
  const { assignmentId, workoutSnapshotId, scheduledDate } = await params;
  const resolvedSearchParams = await searchParams;
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole !== "athlete") {
    redirect("/app");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    notFound();
  }

  const [assignment, slots, sessions, workoutItems, workouts] =
    await Promise.all([
      withDatabase((database) =>
        findPublishedAssignmentForAthlete(database, {
          organizationId: context.membership.organizationId,
          athleteUserId: context.user.id,
          assignmentId,
        }),
      ),
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
      withDatabase((database) =>
        listWorkoutItemsForSnapshot(database, {
          organizationId: context.membership.organizationId,
          assignmentId,
          workoutSnapshotId,
        }),
      ),
      withDatabase((database) =>
        listWorkoutsForAthleteAssignment(database, {
          organizationId: context.membership.organizationId,
          assignmentId,
        }),
      ),
    ]);

  if (!assignment || workoutItems.length === 0) {
    notFound();
  }

  const workoutName =
    workouts.find((workout) => workout.id === workoutSnapshotId)?.name ??
    "Workout";

  const slot =
    slots.find(
      (candidate) => candidate.workoutSnapshotId === workoutSnapshotId,
    ) ?? null;

  if (assignment.sourceType === "plan" && !slot) {
    notFound();
  }

  const session =
    sessions.find(
      (candidate) =>
        candidate.workoutSnapshotId === workoutSnapshotId &&
        candidate.scheduledDate === scheduledDate &&
        (slot === null || candidate.planSlotSnapshotId === slot.id),
    ) ?? null;

  let occurrenceStatus: PlanOccurrenceStatus | null = null;
  let weeklySummary: {
    completedThisWeek: number;
    target: number;
    targetMet: boolean;
  } | null = null;

  if (slot && assignment.startDate && assignment.endDate) {
    const overview = buildPlanOccurrenceOverview({
      slots: [slot],
      sessions,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      timezone: assignment.timezone,
    });

    if (slot.scheduleType === "fixed_day") {
      occurrenceStatus =
        overview.fixedOccurrences.find(
          (occurrence) => occurrence.scheduledDate === scheduledDate,
        )?.status ?? null;

      if (occurrenceStatus === null) {
        notFound();
      }
    } else {
      const flexible = overview.flexibleSlots[0] ?? null;
      weeklySummary = flexible
        ? {
            completedThisWeek: flexible.completedThisWeek,
            target: flexible.targetSessionsPerWeek,
            targetMet: flexible.targetMet,
          }
        : null;

      if (
        compareDates(scheduledDate, assignment.startDate) < 0 ||
        compareDates(scheduledDate, assignment.endDate) > 0
      ) {
        notFound();
      }
    }
  }

  const sessionResults = session
    ? await withDatabase((database) =>
        listSessionResultsForAthleteAssignment(database, {
          organizationId: context.membership.organizationId,
          assignmentId,
          athleteUserId: context.user.id,
          sessionId: session.id,
        }),
      )
    : [];
  const resultByItemId = new Map(
    sessionResults.map((result) => [result.itemSnapshotId, result]),
  );

  const feedbackError = Array.isArray(resolvedSearchParams.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams.error;
  const started = readFlag(resolvedSearchParams, "started");
  const saved = readFlag(resolvedSearchParams, "saved");
  const submitted = readFlag(resolvedSearchParams, "submitted");
  const reset = readFlag(resolvedSearchParams, "reset");

  const isSubmitted = session?.status === "submitted";
  const editSubmitted = isSubmitted && readFlag(resolvedSearchParams, "edit");
  const canStart =
    session === null &&
    assignment.status === "published" &&
    occurrenceStatus !== "upcoming" &&
    weeklySummary?.targetMet !== true;
  const canEdit = session !== null && (!isSubmitted || editSubmitted);
  const canSubmit = canEdit && !isSubmitted;

  const scheduleRule = slot
    ? slot.scheduleType === "fixed_day"
      ? `Every ${slot.dayOfWeek ? slot.dayOfWeek.charAt(0).toUpperCase() + slot.dayOfWeek.slice(1) : ""}`
      : `${slot.targetSessionsPerWeek ?? 1}x per week`
    : "Single workout";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link
              href={`/app/athlete/assignments/${assignmentId}`}
              className="underline-offset-2 hover:underline"
            >
              {assignment.sourceName}
            </Link>{" "}
            · {scheduleRule}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workoutName}
            {slot?.label ? ` · ${slot.label}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatOccurrenceDate(scheduledDate)}
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href={`/app/athlete/assignments/${assignmentId}`}>
            Back to plan
          </Link>
        </Button>
      </section>

      {started || saved || submitted || reset || feedbackError ? (
        <Card
          className={
            feedbackError
              ? "border-destructive/50 bg-destructive/5"
              : "border-emerald-500/40 bg-emerald-500/5"
          }
        >
          <CardContent className="pt-6 text-sm">
            {started
              ? "Workout started."
              : saved
                ? "Progress saved."
                : submitted
                  ? "Workout completed."
                  : reset
                    ? "Workout reset."
                    : (errorCopy[feedbackError ?? ""] ??
                      errorCopy.assignment_session_action_failed)}
          </CardContent>
        </Card>
      ) : null}

      {assignment.status === "canceled" ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm">
            This assignment was canceled. Your existing session and results
            remain available.
          </CardContent>
        </Card>
      ) : null}

      {isSubmitted && !editSubmitted ? (
        <Button asChild variant="outline">
          <Link href="?edit=1">Edit results</Link>
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Status:{" "}
            {session
              ? session.status === "submitted"
                ? "Completed"
                : "In progress"
              : occurrenceStatus === "upcoming"
                ? "Upcoming"
                : "Not started"}
          </p>
          {weeklySummary ? (
            <p>
              This week: {weeklySummary.completedThisWeek} of{" "}
              {weeklySummary.target} completed
            </p>
          ) : null}
          {session?.submittedAt ? (
            <p>
              Completed:{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(session.submittedAt)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {session === null ? (
        <form action={startWorkoutOccurrenceAction}>
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input
            type="hidden"
            name="workoutSnapshotId"
            value={workoutSnapshotId}
          />
          <input type="hidden" name="scheduledDate" value={scheduledDate} />
          <input
            type="hidden"
            name="planSlotSnapshotId"
            value={slot?.id ?? ""}
          />
          <Button type="submit" disabled={!canStart}>
            Start Workout
          </Button>
        </form>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={autosaveWorkoutOccurrenceAction} className="space-y-4">
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input
              type="hidden"
              name="workoutSnapshotId"
              value={workoutSnapshotId}
            />
            <input type="hidden" name="scheduledDate" value={scheduledDate} />
            <input type="hidden" name="sessionId" value={session?.id ?? ""} />
            <input
              type="hidden"
              name="expectedVersion"
              value={session?.version ?? ""}
            />
            {editSubmitted ? (
              <input type="hidden" name="allowSubmittedEdit" value="1" />
            ) : null}

            <div className="space-y-3">
              {workoutItems.map((item) => {
                const result = resultByItemId.get(item.id);

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border/70 bg-background/70 p-3"
                  >
                    <input
                      type="hidden"
                      name="itemSnapshotIds"
                      value={item.id}
                    />
                    <p className="text-sm font-medium">{item.exerciseName}</p>
                    <p className="text-xs text-muted-foreground">
                      Block {item.blockPosition + 1}
                      {item.blockLabel ? ` (${item.blockLabel})` : ""} -
                      Exercise {item.itemPosition + 1}
                    </p>
                    <AthleteWorkoutResultFields
                      item={item}
                      result={result}
                      disabled={!canEdit}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!canEdit}>
                Save Progress
              </Button>
              <Button
                type="submit"
                formAction={submitWorkoutOccurrenceAction}
                disabled={!canSubmit}
              >
                Complete Workout
              </Button>
            </div>
          </form>

          <form action={resetWorkoutOccurrenceAction}>
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input
              type="hidden"
              name="workoutSnapshotId"
              value={workoutSnapshotId}
            />
            <input type="hidden" name="scheduledDate" value={scheduledDate} />
            <input type="hidden" name="sessionId" value={session?.id ?? ""} />
            <input
              type="hidden"
              name="expectedVersion"
              value={session?.version ?? ""}
            />
            <Button type="submit" variant="destructive" disabled={!canEdit}>
              Reset Workout
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
