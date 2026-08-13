import Link from "next/link";
import { notFound } from "next/navigation";

import { ComplianceDefinitions } from "@/components/compliance-definitions";
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
import { saveAthletePrescriptionOverrideAction } from "./prescription-actions";
import { ClearOverrideButton } from "./clear-override-button";
import { listTeamAthletePrescriptionItems } from "@/modules/assignments/db/athlete-prescription-queries";
import { findTeamAssignmentCompliance } from "@/modules/assignments/db/team-compliance-queries";

interface TeamAssignmentPerformancePageProps {
  params: Promise<{ teamId: string; assignmentId: string }>;
  searchParams: Promise<{ window?: string; prescription?: string }>;
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
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
  const [assignment, prescriptionItems] = await withDatabase((database) =>
    Promise.all([
      findTeamAssignmentCompliance(database, {
        organizationId: context.membership.organizationId,
        teamId,
        assignmentId,
        windowDays,
      }),
      listTeamAthletePrescriptionItems(database, {
        organizationId: context.membership.organizationId,
        teamId,
        assignmentId,
      }),
    ]),
  );

  if (!assignment) notFound();

  const canManagePrescription =
    hasPermission(context.access, "workout.assign.organization") ||
    hasPermission(context.access, "workout.assign.team");

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
              {assignment.timeliness.current.timelinessEligible} due scheduled
              workouts
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

      {filters.prescription ? (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          {filters.prescription === "saved"
            ? "Individual prescription saved for future unstarted sessions."
            : filters.prescription === "cleared"
              ? "Individual prescription cleared for future unstarted sessions."
              : filters.prescription === "conflict"
                ? "Another coach changed this prescription. Reload the page and apply your changes again."
                : filters.prescription === "locked"
                  ? "That occurrence has already started. Create or update a prescription for a future unstarted occurrence instead."
                  : "The prescription could not be changed. Check your access and try again."}
        </p>
      ) : null}

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
          const athletePrescriptionItems = prescriptionItems.filter(
            (item) => item.recipientId === recipient.id,
          );
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
                {athletePrescriptionItems.length > 0 ? (
                  <details className="rounded-md border border-border/70 p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Individual prescription
                    </summary>
                    <div className="mt-3 space-y-3">
                      {athletePrescriptionItems.map((item) => {
                        const overrideFields = new Set(
                          item.overriddenFields ?? [],
                        );
                        return (
                          <form
                            key={`${item.itemSnapshotId}:${item.planSlotSnapshotId ?? "assignment"}`}
                            action={saveAthletePrescriptionOverrideAction}
                            className="grid gap-3 border-t pt-3 first:border-t-0 first:pt-0 sm:grid-cols-2"
                          >
                            <input type="hidden" name="teamId" value={teamId} />
                            <input
                              type="hidden"
                              name="assignmentId"
                              value={assignmentId}
                            />
                            <input
                              type="hidden"
                              name="recipientId"
                              value={recipient.id}
                            />
                            <input
                              type="hidden"
                              name="athleteUserId"
                              value={recipient.athleteUserId}
                            />
                            <input
                              type="hidden"
                              name="itemSnapshotId"
                              value={item.itemSnapshotId}
                            />
                            <input
                              type="hidden"
                              name="planSlotSnapshotId"
                              value={item.planSlotSnapshotId ?? ""}
                            />
                            {item.overrideVersion !== null ? (
                              <input
                                type="hidden"
                                name="expectedVersion"
                                value={item.overrideVersion}
                              />
                            ) : null}
                            <div className="space-y-1 sm:col-span-2">
                              <p className="text-sm font-medium">
                                {item.exerciseName}
                                {item.planSlotSnapshotId
                                  ? ` - ${item.planSlotLabel || (item.scheduleType === "fixed_day" ? "Fixed session" : "Weekly session")}`
                                  : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {canManagePrescription
                                  ? "Check a field to individualize it. Unchecked fields inherit the shared base prescription."
                                  : "Read-only shared base and effective prescription."}
                              </p>
                            </div>
                            <fieldset
                              disabled={!canManagePrescription}
                              className="contents"
                            >
                              <label className="grid gap-1 text-xs">
                                <span>
                                  <input
                                    type="checkbox"
                                    name="overriddenFields"
                                    value="reps"
                                    defaultChecked={overrideFields.has("reps")}
                                  />{" "}
                                  Reps (base {item.reps ?? "-"})
                                </span>
                                <input
                                  className="h-8 rounded-md border bg-background px-2 text-sm"
                                  name="reps"
                                  type="number"
                                  min="0"
                                  defaultValue={
                                    item.overrideReps?.toString() ??
                                    item.reps?.toString() ??
                                    ""
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-xs">
                                <span>
                                  <input
                                    type="checkbox"
                                    name="overriddenFields"
                                    value="load"
                                    defaultChecked={overrideFields.has("load")}
                                  />{" "}
                                  Load (base {item.load ?? "-"})
                                </span>
                                <div className="flex gap-2">
                                  <input
                                    className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                                    name="loadValue"
                                    type="number"
                                    min="0"
                                    step="any"
                                    defaultValue={item.overrideLoadValue ?? ""}
                                  />
                                  <select
                                    className="h-8 rounded-md border bg-background px-2 text-sm"
                                    name="loadUnit"
                                    defaultValue={item.overrideLoadUnit ?? ""}
                                  >
                                    <option value="">Unit</option>
                                    <option value="lb">lb</option>
                                    <option value="kg">kg</option>
                                  </select>
                                </div>
                                <input
                                  type="hidden"
                                  name="load"
                                  value={item.overrideLoad ?? ""}
                                />
                              </label>
                              <label className="grid gap-1 text-xs sm:col-span-2">
                                <span>
                                  <input
                                    type="checkbox"
                                    name="overriddenFields"
                                    value="durationSeconds"
                                    defaultChecked={overrideFields.has(
                                      "durationSeconds",
                                    )}
                                  />{" "}
                                  Duration seconds (base{" "}
                                  {item.durationSeconds ?? "-"})
                                </span>
                                <input
                                  className="h-8 rounded-md border bg-background px-2 text-sm"
                                  name="durationSeconds"
                                  type="number"
                                  min="0"
                                  defaultValue={
                                    item.overrideDurationSeconds?.toString() ??
                                    item.durationSeconds?.toString() ??
                                    ""
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-xs">
                                <span>
                                  <input
                                    type="checkbox"
                                    name="overriddenFields"
                                    value="distanceMeters"
                                    defaultChecked={overrideFields.has(
                                      "distanceMeters",
                                    )}
                                  />{" "}
                                  Distance meters (base{" "}
                                  {item.distanceMeters ?? "-"})
                                </span>
                                <input
                                  className="h-8 rounded-md border bg-background px-2 text-sm"
                                  name="distanceMeters"
                                  type="number"
                                  min="0"
                                  defaultValue={
                                    item.overrideDistanceMeters?.toString() ??
                                    item.distanceMeters?.toString() ??
                                    ""
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-xs">
                                <span>
                                  <input
                                    type="checkbox"
                                    name="overriddenFields"
                                    value="restSeconds"
                                    defaultChecked={overrideFields.has(
                                      "restSeconds",
                                    )}
                                  />{" "}
                                  Rest seconds (base {item.restSeconds ?? "-"})
                                </span>
                                <input
                                  className="h-8 rounded-md border bg-background px-2 text-sm"
                                  name="restSeconds"
                                  type="number"
                                  min="0"
                                  defaultValue={
                                    item.overrideRestSeconds?.toString() ??
                                    item.restSeconds?.toString() ??
                                    ""
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-xs">
                                <span>
                                  <input
                                    type="checkbox"
                                    name="overriddenFields"
                                    value="tempo"
                                    defaultChecked={overrideFields.has("tempo")}
                                  />{" "}
                                  Tempo (base {item.tempo ?? "-"})
                                </span>
                                <input
                                  className="h-8 rounded-md border bg-background px-2 text-sm"
                                  name="tempo"
                                  defaultValue={
                                    item.overrideTempo ?? item.tempo ?? ""
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-xs">
                                <span>
                                  <input
                                    type="checkbox"
                                    name="overriddenFields"
                                    value="notes"
                                    defaultChecked={overrideFields.has("notes")}
                                  />{" "}
                                  Notes
                                </span>
                                <input
                                  className="h-8 rounded-md border bg-background px-2 text-sm"
                                  name="notes"
                                  defaultValue={
                                    item.overrideNotes ?? item.notes ?? ""
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-xs sm:col-span-2">
                                Reason
                                <input
                                  className="h-8 rounded-md border bg-background px-2 text-sm"
                                  name="reason"
                                  placeholder="Optional coaching context"
                                />
                              </label>
                              <Button type="submit" size="sm" className="w-fit">
                                Save prescription
                              </Button>
                              {item.overrideVersion !== null ? (
                                <ClearOverrideButton
                                  exerciseName={item.exerciseName}
                                />
                              ) : null}
                            </fieldset>
                          </form>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
                {recipient.occurrences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No scheduled workouts fall within this time window.
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
                                  {occurrence.sessionId ? (
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

      <ComplianceDefinitions
        windowLabel={windowDays === null ? "all-time" : `${windowDays}-day`}
      />
    </main>
  );
}
