import Link from "next/link";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadActiveAppContext } from "@/lib/app-context";
import { hasPermission } from "@/modules/access-control/permissions";
import { listAssignmentsForOrganization } from "@/modules/assignments/db/queries";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";

function formatDate(value: Date | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AssignmentsPage() {
  const context = await loadActiveAppContext();

  const [teamMemberships, assignmentItems] = await Promise.all([
    withDatabase((database) =>
      listTeamMembershipsForUserInOrganization(database, {
        organizationId: context.membership.organizationId,
        userId: context.user.id,
      }),
    ),
    withDatabase((database) =>
      listAssignmentsForOrganization(database, {
        organizationId: context.membership.organizationId,
      }),
    ),
  ]);

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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assignments</h1>
          <p className="text-sm text-muted-foreground">
            Plan and workout assignments scoped to{" "}
            {context.membership.organizationName}.
          </p>
        </div>

        <Button asChild>
          <Link href="/app/assignments/new">New Assignment</Link>
        </Button>
      </section>

      {assignmentItems.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No assignments yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Create your first assignment to schedule a plan or a single
              workout.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {assignmentItems.map((assignment) => (
            <Card key={assignment.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-lg">
                    <Link
                      href={`/app/assignments/${assignment.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {assignment.sourceName}
                    </Link>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {assignment.sourceType === "plan" ? "Plan" : "Workout"} ·{" "}
                    {assignment.status}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/app/assignments/${assignment.id}`}>Open</Link>
                </Button>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p>Targets: {assignment.targetCount}</p>
                <p>Recipients: {assignment.recipientCount}</p>
                <p>Published: {formatDate(assignment.publishedAt)}</p>
                <p>Updated: {formatDate(assignment.updatedAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
