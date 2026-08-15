import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { AssignmentSourceFields } from "@/components/assignments/assignment-source-fields";
import { AssignmentTargetFields } from "@/components/assignments/assignment-target-fields";
import { buildAthleteTargetOptions } from "@/components/assignments/assignment-target-options";
import { PublishAssignmentDialog } from "@/components/assignments/publish-assignment-dialog";
import { PrepareAssignmentDialog } from "@/components/assignments/prepare-assignment-dialog";
import { PreparedPrescriptionEditor } from "@/components/assignments/prepared-prescription-editor";
import { ReturnAssignmentToDraftButton } from "@/components/assignments/return-assignment-to-draft-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadActiveAppContext } from "@/lib/app-context";
import { hasPermission } from "@/modules/access-control/permissions";
import {
  cancelAssignmentAction,
  updateAssignmentAction,
} from "@/app/(app)/app/assignments/actions";
import { listAssignmentTargetData } from "@/modules/assignments/application/assignment-target-data";
import { findAssignmentByOrganization } from "@/modules/assignments/db/queries";
import {
  findPreparedRecipientRosterChanges,
  listAssignmentAthletePrescriptionItems,
  listAssignmentPrescriptionRecipients,
} from "@/modules/assignments/db/athlete-prescription-queries";
import { listPlansForOrganization } from "@/modules/plans/db/queries";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";
import { listWorkoutsForOrganization } from "@/modules/workouts/db/queries";

interface AssignmentDetailPageProps {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    prepared?: string;
    reset?: string;
    published?: string;
    prescription?: string;
    recipient?: string;
    exercise?: string;
  }>;
}

function formatDate(value: Date | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AssignmentDetailPage({
  params,
  searchParams,
}: AssignmentDetailPageProps) {
  const { assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const feedback = await searchParams;
  const context = await loadActiveAppContext();

  const teamMemberships = await withDatabase((database) =>
    listTeamMembershipsForUserInOrganization(database, {
      organizationId: context.membership.organizationId,
      userId: context.user.id,
    }),
  );

  const canAssignOrganization = hasPermission(
    { organizationRole: context.membership.organizationRole },
    "workout.assign.organization",
  );
  const canAssignTeam =
    teamMemberships.some((membership) => membership.teamRole === "manager") &&
    hasPermission(
      {
        organizationRole: context.membership.organizationRole,
        teamRole: "manager",
      },
      "workout.assign.team",
    );

  if (!canAssignOrganization && !canAssignTeam) {
    redirect("/app");
  }

  const managedTeamIds = teamMemberships
    .filter((membership) => membership.teamRole === "manager")
    .map((membership) => membership.teamId);
  const [
    assignment,
    plans,
    workouts,
    targetData,
    prescriptionRecipients,
    prescriptionItems,
    rosterChanges,
  ] = await Promise.all([
    withDatabase((database) =>
      findAssignmentByOrganization(database, {
        organizationId: context.membership.organizationId,
        assignmentId,
        managedTeamIds: canAssignOrganization ? undefined : managedTeamIds,
      }),
    ),
    withDatabase((database) =>
      listPlansForOrganization(database, {
        organizationId: context.membership.organizationId,
        status: "active",
      }),
    ),
    withDatabase((database) =>
      listWorkoutsForOrganization(database, {
        organizationId: context.membership.organizationId,
        status: "active",
      }),
    ),
    withDatabase((database) =>
      listAssignmentTargetData(database, {
        organizationId: context.membership.organizationId,
        managedTeamIds: canAssignOrganization ? undefined : managedTeamIds,
      }),
    ),
    withDatabase((database) =>
      listAssignmentPrescriptionRecipients(database, {
        organizationId: context.membership.organizationId,
        assignmentId,
      }),
    ),
    withDatabase((database) =>
      listAssignmentAthletePrescriptionItems(database, {
        organizationId: context.membership.organizationId,
        assignmentId,
      }),
    ),
    withDatabase((database) =>
      findPreparedRecipientRosterChanges(database, {
        organizationId: context.membership.organizationId,
        assignmentId,
      }),
    ),
  ]);

  if (!assignment) {
    notFound();
  }

  const isDraft = assignment.status === "draft";
  const isPrepared = assignment.status === "prepared";
  const sourceType = assignment.sourcePlanId ? "plan" : "workout";
  const selectedTeamIds = assignment.targets
    .filter((target) => target.targetType === "team")
    .map((target) => target.teamId ?? "")
    .filter(Boolean);
  const selectedAthleteIds = assignment.targets
    .filter((target) => target.targetType === "athlete")
    .map((target) => target.athleteUserId ?? "")
    .filter(Boolean);
  const athleteOptions = buildAthleteTargetOptions({
    members: targetData.members,
    teamMemberships: targetData.teamMembers,
    teams: targetData.teams,
  });
  const selectedTeamIdSet = new Set(selectedTeamIds);
  const recipientEstimate = isDraft
    ? athleteOptions.filter(
        (athlete) =>
          selectedAthleteIds.includes(athlete.id) ||
          athlete.teamIds.some((teamId) => selectedTeamIdSet.has(teamId)),
      ).length
    : assignment.recipientCount;
  const schedule = assignment.scheduledDate
    ? assignment.scheduledDate
    : assignment.startDate && assignment.endDate
      ? `${assignment.startDate} to ${assignment.endDate}`
      : "Not scheduled";
  const feedbackMessage = feedback.created
    ? "Draft created. Review it before publishing."
    : feedback.updated
      ? "Draft changes saved."
      : feedback.prepared
        ? "Assignment prepared. Review each athlete's effective prescription before publishing."
        : feedback.reset
          ? "Assignment returned to draft. Prepared prescriptions were discarded."
          : feedback.published
            ? "Assignment published and visible to recipients."
            : feedback.prescription === "saved"
              ? "Individual prescription saved."
              : feedback.prescription === "cleared"
                ? "Individual prescription cleared."
                : feedback.prescription
                  ? "The prescription changed elsewhere or could not be saved. Reload and try again."
                  : null;
  const recipientFilter = feedback.recipient?.trim().toLowerCase() ?? "";
  const exerciseFilter = feedback.exercise?.trim() ?? "";
  const exerciseNames = [
    ...new Set(prescriptionItems.map((item) => item.exerciseName)),
  ].toSorted();
  const snapshotProvenance = [
    ...new Map(
      prescriptionItems.map((item) => [
        item.workoutSnapshotId,
        `${item.workoutName}${item.sourceWorkoutVersion ? ` v${item.sourceWorkoutVersion}` : ""}`,
      ]),
    ).values(),
  ];
  const individualizedRecipientCount = new Set(
    prescriptionItems
      .filter((item) => item.overrideId)
      .map((item) => item.recipientId),
  ).size;
  const recipientName = (athleteUserId: string) => {
    const recipient = prescriptionRecipients.find(
      (candidate) => candidate.athleteUserId === athleteUserId,
    );
    return recipient?.fullName?.trim() || recipient?.email || athleteUserId;
  };
  const visibleRecipients = prescriptionRecipients.filter((recipient) => {
    const matchesRecipient = `${recipient.fullName ?? ""} ${recipient.email}`
      .toLowerCase()
      .includes(recipientFilter);
    const recipientItems = prescriptionItems.filter(
      (item) => item.recipientId === recipient.recipientId,
    );
    return (
      matchesRecipient &&
      (!exerciseFilter ||
        recipientItems.some((item) => item.exerciseName === exerciseFilter))
    );
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Assignment Detail
          </h1>
          <p className="text-sm text-muted-foreground">
            {assignment.sourceName} · {assignment.status}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/assignments">Back to assignments</Link>
        </Button>
      </section>

      {feedbackMessage && (
        <div
          role="status"
          className="border-l-4 border-primary bg-muted px-4 py-3 text-sm"
        >
          {feedbackMessage}
        </div>
      )}

      <section className="space-y-3 border-y py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Delivery Review</h2>
            <p className="text-sm text-muted-foreground">
              {isDraft
                ? "This draft is editable and not visible to athletes."
                : isPrepared
                  ? "Frozen for prescription review and still hidden from athletes."
                  : "This assignment's delivery details are read-only."}
            </p>
          </div>
          <span className="rounded-md border px-2 py-1 text-xs font-medium capitalize">
            {assignment.status}
          </span>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="font-medium">
              {assignment.sourceName} ({sourceType})
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Schedule</dt>
            <dd className="font-medium">{schedule}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Targets</dt>
            <dd className="font-medium">
              {selectedTeamIds.length} teams, {selectedAthleteIds.length}{" "}
              individuals
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {isDraft ? "Estimated recipients" : "Recipients"}
            </dt>
            <dd className="font-medium">{recipientEstimate} athletes</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Timezone: {assignment.timezone}
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p>Created: {formatDate(assignment.createdAt)}</p>
          <p>Updated: {formatDate(assignment.updatedAt)}</p>
          <p>Published: {formatDate(assignment.publishedAt)}</p>
          <p>Canceled: {formatDate(assignment.canceledAt)}</p>
        </CardContent>
      </Card>

      <form action={updateAssignmentAction} className="space-y-6">
        <input type="hidden" name="assignmentId" value={assignment.id} />
        <input type="hidden" name="version" value={assignment.version} />

        <Card>
          <CardHeader>
            <CardTitle>Source</CardTitle>
          </CardHeader>
          <CardContent>
            <AssignmentSourceFields
              plans={plans}
              workouts={workouts}
              initialSourceType={sourceType}
              initialPlanId={assignment.sourcePlanId ?? ""}
              initialWorkoutId={assignment.sourceWorkoutId ?? ""}
              initialScheduledDate={assignment.scheduledDate ?? ""}
              initialStartDate={assignment.startDate ?? ""}
              initialEndDate={assignment.endDate ?? ""}
              disabled={!isDraft}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Targets</CardTitle>
          </CardHeader>
          <CardContent>
            <AssignmentTargetFields
              teams={targetData.teams.map((team) => ({
                id: team.id,
                label: team.name,
              }))}
              athletes={athleteOptions}
              selectedTeamIds={selectedTeamIds}
              selectedAthleteIds={selectedAthleteIds}
              disabled={!isDraft}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!isDraft}>
            Save Draft
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/assignments">Done</Link>
          </Button>
        </div>
      </form>

      {isPrepared ? (
        <section className="space-y-4" aria-labelledby="prescription-review">
          <div className="space-y-1">
            <h2 id="prescription-review" className="text-lg font-semibold">
              Recipient prescriptions
            </h2>
            <p className="text-sm text-muted-foreground">
              Review the shared base and individualize only the fields that
              should differ for an athlete. Unchecked fields remain inherited.
            </p>
            <p className="text-xs text-muted-foreground">
              Frozen source: {snapshotProvenance.join(", ")} · Prepared{" "}
              {formatDate(assignment.preparedAt)}
            </p>
          </div>
          {rosterChanges.addedAthleteUserIds.length > 0 ||
          rosterChanges.removedAthleteUserIds.length > 0 ? (
            <div className="border-l-4 border-amber-500 bg-muted px-4 py-3 text-sm">
              <p className="font-medium">
                The target roster changed after preparation.
              </p>
              {rosterChanges.addedAthleteUserIds.length > 0 ? (
                <p>
                  {rosterChanges.addedAthleteUserIds.length} newly eligible
                  athletes are not included. Return to draft to include them.
                </p>
              ) : null}
              {rosterChanges.removedAthleteUserIds.length > 0 ? (
                <p>
                  Reviewed recipients no longer in the target roster remain
                  included while eligible:{" "}
                  {rosterChanges.removedAthleteUserIds
                    .map(recipientName)
                    .join(", ")}
                  .
                </p>
              ) : null}
            </div>
          ) : null}
          {rosterChanges.ineligibleAthleteUserIds.length > 0 ? (
            <div
              role="alert"
              className="border-l-4 border-destructive bg-muted px-4 py-3 text-sm"
            >
              Publication is blocked because these recipients are no longer
              organization athletes:{" "}
              {rosterChanges.ineligibleAthleteUserIds
                .map(recipientName)
                .join(", ")}
              . Return to draft and review the targets.
            </div>
          ) : null}
          <form className="grid gap-3 border-y py-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Find recipient
              <input
                className="h-9 rounded-md border bg-background px-3"
                name="recipient"
                defaultValue={feedback.recipient ?? ""}
                placeholder="Name or email"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Exercise
              <select
                className="h-9 rounded-md border bg-background px-3"
                name="exercise"
                defaultValue={exerciseFilter}
              >
                <option value="">All exercises</option>
                {exerciseNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" className="w-fit">
              Apply filters
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            {prescriptionRecipients.length - individualizedRecipientCount} fully
            inherited · {individualizedRecipientCount} individualized ·{" "}
            {visibleRecipients.length} shown
          </p>
          {visibleRecipients.length === 0 ? (
            <p className="border-y py-6 text-sm text-muted-foreground">
              No prepared recipients match these filters.
            </p>
          ) : (
            visibleRecipients.map((recipient) => {
              const items = prescriptionItems.filter(
                (item) =>
                  item.recipientId === recipient.recipientId &&
                  (!exerciseFilter || item.exerciseName === exerciseFilter),
              );
              const overrideCount = items.filter(
                (item) => item.overrideId,
              ).length;
              return (
                <Card key={recipient.recipientId}>
                  <CardHeader>
                    <CardTitle>
                      {recipient.fullName?.trim() || recipient.email}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {recipient.email} ·{" "}
                      {recipient.isDirectTarget
                        ? "Direct target"
                        : "Team target"}
                      {recipient.teamNames.length > 0
                        ? ` · ${recipient.teamNames.join(", ")}`
                        : ""}{" "}
                      · {overrideCount} individualized
                    </p>
                  </CardHeader>
                  <CardContent>
                    <PreparedPrescriptionEditor
                      assignmentId={assignment.id}
                      recipientId={recipient.recipientId}
                      athleteUserId={recipient.athleteUserId}
                      items={items}
                    />
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-2">
        {isDraft && (
          <PrepareAssignmentDialog
            assignmentId={assignment.id}
            version={assignment.version}
            recipientEstimate={recipientEstimate}
          />
        )}
        {isPrepared ? (
          <>
            <PublishAssignmentDialog
              assignmentId={assignment.id}
              version={assignment.version}
              recipientEstimate={assignment.recipientCount}
              disabled={rosterChanges.ineligibleAthleteUserIds.length > 0}
            />
            <ReturnAssignmentToDraftButton
              assignmentId={assignment.id}
              version={assignment.version}
              hasOverrides={prescriptionItems.some((item) => item.overrideId)}
            />
          </>
        ) : null}

        <form action={cancelAssignmentAction}>
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <input type="hidden" name="version" value={assignment.version} />
          <Button
            type="submit"
            variant="destructive"
            disabled={!isDraft && !isPrepared}
          >
            Cancel Draft
          </Button>
        </form>
      </section>
    </main>
  );
}
