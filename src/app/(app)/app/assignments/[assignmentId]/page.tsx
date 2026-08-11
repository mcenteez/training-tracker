import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { loadActiveAppContext } from "@/lib/app-context";
import { hasPermission } from "@/modules/access-control/permissions";
import {
  cancelAssignmentAction,
  publishAssignmentAction,
  updateAssignmentAction,
} from "@/app/(app)/app/assignments/actions";
import { findAssignmentByOrganization } from "@/modules/assignments/db/queries";
import { listPlansForOrganization } from "@/modules/plans/db/queries";
import {
  listOrganizationMembersByOrganizationId,
  listTeamMembershipsForUserInOrganization,
  listTeamsByOrganizationId,
} from "@/modules/teams/db/queries";
import { listWorkoutsForOrganization } from "@/modules/workouts/db/queries";

interface AssignmentDetailPageProps {
  params: Promise<{ assignmentId: string }>;
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
}: AssignmentDetailPageProps) {
  const { assignmentId } = await params;
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
  const [assignment, plans, workouts, teams, members] = await Promise.all([
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
      listTeamsByOrganizationId(database, context.membership.organizationId),
    ),
    withDatabase((database) =>
      listOrganizationMembersByOrganizationId(
        database,
        context.membership.organizationId,
      ),
    ),
  ]);

  if (!assignment) {
    notFound();
  }

  const isDraft = assignment.status === "draft";
  const sourceType = assignment.sourcePlanId ? "plan" : "workout";

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
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              Source Type
              <NativeSelect
                name="sourceType"
                defaultValue={sourceType}
                disabled={!isDraft}
              >
                <option value="plan">Plan</option>
                <option value="workout">Workout</option>
              </NativeSelect>
            </label>

            <label className="grid gap-1.5 text-sm">
              Plan
              <NativeSelect
                name="sourcePlanId"
                defaultValue={assignment.sourcePlanId ?? ""}
                disabled={!isDraft}
              >
                <option value="">Select plan...</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="grid gap-1.5 text-sm">
              Workout
              <NativeSelect
                name="sourceWorkoutId"
                defaultValue={assignment.sourceWorkoutId ?? ""}
                disabled={!isDraft}
              >
                <option value="">Select workout...</option>
                {workouts.map((workout) => (
                  <option key={workout.id} value={workout.id}>
                    {workout.name}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="grid gap-1.5 text-sm">
              Scheduled Date
              <Input
                type="date"
                name="scheduledDate"
                defaultValue={assignment.scheduledDate ?? ""}
                disabled={!isDraft}
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              Start Date
              <Input
                type="date"
                name="startDate"
                defaultValue={assignment.startDate ?? ""}
                disabled={!isDraft}
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              End Date
              <Input
                type="date"
                name="endDate"
                defaultValue={assignment.endDate ?? ""}
                disabled={!isDraft}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Targets</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              Teams
              <NativeSelect
                name="teamIds"
                multiple
                className="min-h-36"
                disabled={!isDraft}
                defaultValue={assignment.targets
                  .filter((target) => target.targetType === "team")
                  .map((target) => target.teamId ?? "")
                  .filter(Boolean)}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="grid gap-1.5 text-sm">
              Athletes
              <NativeSelect
                name="athleteUserIds"
                multiple
                className="min-h-36"
                disabled={!isDraft}
                defaultValue={assignment.targets
                  .filter((target) => target.targetType === "athlete")
                  .map((target) => target.athleteUserId ?? "")
                  .filter(Boolean)}
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName ?? member.email}
                  </option>
                ))}
              </NativeSelect>
            </label>
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

      <section className="flex flex-wrap items-center gap-2">
        <form action={publishAssignmentAction}>
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <input type="hidden" name="version" value={assignment.version} />
          <Button type="submit" disabled={!isDraft}>
            Publish Assignment
          </Button>
        </form>

        <form action={cancelAssignmentAction}>
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <input type="hidden" name="version" value={assignment.version} />
          <Button type="submit" variant="destructive" disabled={!isDraft}>
            Cancel Draft
          </Button>
        </form>
      </section>
    </main>
  );
}
