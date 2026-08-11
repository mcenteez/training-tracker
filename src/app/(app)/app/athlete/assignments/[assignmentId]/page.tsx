import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  findLatestSessionForAthleteAssignment,
  findPublishedAssignmentForAthlete,
  listPrimaryWorkoutItemsForAssignment,
  listSessionResultsForAthleteAssignment,
} from "@/modules/assignments/db/queries";

import {
  autosaveAssignmentSessionAction,
  startAssignmentSessionAction,
  submitAssignmentSessionAction,
} from "./actions";

interface AthleteAssignmentDetailPageProps {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

export default async function AthleteAssignmentDetailPage({
  params,
  searchParams,
}: AthleteAssignmentDetailPageProps) {
  const { assignmentId } = await params;
  const resolvedSearchParams = await searchParams;
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole !== "athlete") {
    redirect("/app");
  }

  const [assignment, session, workoutItems] = await Promise.all([
    withDatabase((database) =>
      findPublishedAssignmentForAthlete(database, {
        organizationId: context.membership.organizationId,
        athleteUserId: context.user.id,
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
    withDatabase((database) =>
      listPrimaryWorkoutItemsForAssignment(database, {
        organizationId: context.membership.organizationId,
        assignmentId,
      }),
    ),
  ]);

  if (!assignment) {
    notFound();
  }

  const feedbackError = Array.isArray(resolvedSearchParams.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams.error;
  const started =
    (Array.isArray(resolvedSearchParams.started)
      ? resolvedSearchParams.started[0]
      : resolvedSearchParams.started) === "1";
  const saved =
    (Array.isArray(resolvedSearchParams.saved)
      ? resolvedSearchParams.saved[0]
      : resolvedSearchParams.saved) === "1";
  const submitted =
    (Array.isArray(resolvedSearchParams.submitted)
      ? resolvedSearchParams.submitted[0]
      : resolvedSearchParams.submitted) === "1";

  const existingResults =
    session === null
      ? []
      : await withDatabase((database) =>
          listSessionResultsForAthleteAssignment(database, {
            organizationId: context.membership.organizationId,
            assignmentId,
            athleteUserId: context.user.id,
            sessionId: session.id,
          }),
        );
  const resultByItemId = new Map(
    existingResults.map((result) => [result.itemSnapshotId, result]),
  );

  const canStartSession = session === null && workoutItems.length > 0;
  const canEditSession =
    session !== null &&
    session.status !== "submitted" &&
    workoutItems.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {assignment.sourceName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {assignment.sourceType === "plan" ? "Plan" : "Workout"} assignment
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/app/athlete">Back to dashboard</Link>
        </Button>
      </section>

      {started || saved || submitted || feedbackError ? (
        <Card
          className={
            feedbackError
              ? "border-destructive/50 bg-destructive/5"
              : "border-emerald-500/40 bg-emerald-500/5"
          }
        >
          <CardContent className="pt-6 text-sm">
            {started
              ? "Session started."
              : saved
                ? "Progress saved."
                : submitted
                  ? "Session submitted."
                  : "Unable to complete that session action."}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
          {assignment.sourceType === "plan" ? (
            <>
              <p>Start: {assignment.startDate ?? "-"}</p>
              <p>End: {assignment.endDate ?? "-"}</p>
            </>
          ) : (
            <>
              <p>Scheduled: {assignment.scheduledDate ?? "-"}</p>
              <p>Timezone: {assignment.timezone}</p>
            </>
          )}
          <p>Available from: {formatDateTime(assignment.availableFrom)}</p>
          <p>Available until: {formatDateTime(assignment.availableUntil)}</p>
          <p>Published: {formatDateTime(assignment.publishedAt)}</p>
          <p>Recipients: {assignment.recipientCount}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workout Logging</CardTitle>
        </CardHeader>
        <CardContent>
          {session ? (
            <div className="space-y-1 text-sm">
              <p>Status: {session.status}</p>
              <p>Started: {formatDateTime(session.startedAt)}</p>
              <p>Submitted: {formatDateTime(session.submittedAt)}</p>
              <p>Saved results: {session.resultCount}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No session started yet.
            </p>
          )}
        </CardContent>
      </Card>

      {session === null ? (
        <form action={startAssignmentSessionAction}>
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <Button type="submit" disabled={!canStartSession}>
            Start Session
          </Button>
        </form>
      ) : null}

      {workoutItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Assigned Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              action={autosaveAssignmentSessionAction}
              className="space-y-4"
            >
              <input type="hidden" name="assignmentId" value={assignmentId} />
              <input type="hidden" name="sessionId" value={session?.id ?? ""} />
              <input
                type="hidden"
                name="expectedVersion"
                value={session?.version ?? ""}
              />

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
                        {item.blockLabel ? ` · ${item.blockLabel}` : ""} · Item{" "}
                        {item.itemPosition + 1}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-xs">
                          Reps
                          <Input
                            name={`result:${item.id}:reps`}
                            defaultValue={
                              result?.reps?.toString() ??
                              item.reps?.toString() ??
                              ""
                            }
                            inputMode="numeric"
                            disabled={!canEditSession}
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          Load
                          <Input
                            name={`result:${item.id}:load`}
                            defaultValue={result?.load ?? item.load ?? ""}
                            disabled={!canEditSession}
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          Duration Seconds
                          <Input
                            name={`result:${item.id}:durationSeconds`}
                            defaultValue={
                              result?.durationSeconds?.toString() ??
                              item.durationSeconds?.toString() ??
                              ""
                            }
                            inputMode="numeric"
                            disabled={!canEditSession}
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          Distance Meters
                          <Input
                            name={`result:${item.id}:distanceMeters`}
                            defaultValue={
                              result?.distanceMeters?.toString() ??
                              item.distanceMeters?.toString() ??
                              ""
                            }
                            inputMode="numeric"
                            disabled={!canEditSession}
                          />
                        </label>
                        <label className="grid gap-1 text-xs sm:col-span-2">
                          Notes
                          <Input
                            name={`result:${item.id}:notes`}
                            defaultValue={result?.notes ?? item.notes ?? ""}
                            disabled={!canEditSession}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={!canEditSession}>
                  Save Progress
                </Button>
              </div>
            </form>

            <form action={submitAssignmentSessionAction}>
              <input type="hidden" name="assignmentId" value={assignmentId} />
              <input type="hidden" name="sessionId" value={session?.id ?? ""} />
              <input
                type="hidden"
                name="expectedVersion"
                value={session?.version ?? ""}
              />
              <Button type="submit" disabled={!canEditSession}>
                Submit Session
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Assigned Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This assignment does not yet include workout snapshots to log.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
