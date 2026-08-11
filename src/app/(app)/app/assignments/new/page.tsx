import Link from "next/link";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { AssignmentSourceFields } from "@/components/assignments/assignment-source-fields";
import { loadActiveAppContext } from "@/lib/app-context";
import { hasPermission } from "@/modules/access-control/permissions";
import { createAssignmentAction } from "@/app/(app)/app/assignments/actions";
import { listPlansForOrganization } from "@/modules/plans/db/queries";
import { listTeamsByOrganizationId } from "@/modules/teams/db/queries";
import { listOrganizationMembersByOrganizationId } from "@/modules/teams/db/queries";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";
import { listWorkoutsForOrganization } from "@/modules/workouts/db/queries";

export default async function NewAssignmentPage() {
  const context = await loadActiveAppContext();

  const [teamMemberships, plans, workouts, teams, members] = await Promise.all([
    withDatabase((database) =>
      listTeamMembershipsForUserInOrganization(database, {
        organizationId: context.membership.organizationId,
        userId: context.user.id,
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
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          New Assignment
        </h1>
        <p className="text-sm text-muted-foreground">
          Build a draft assignment for teams and athletes.
        </p>
      </section>

      <form action={createAssignmentAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Source</CardTitle>
          </CardHeader>
          <CardContent>
            <AssignmentSourceFields plans={plans} workouts={workouts} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Targets</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              Teams
              <NativeSelect name="teamIds" multiple className="min-h-36">
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="grid gap-1.5 text-sm">
              Athletes
              <NativeSelect name="athleteUserIds" multiple className="min-h-36">
                {members
                  .filter((member) => member.organizationRole === "athlete")
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.fullName ?? member.email}
                    </option>
                  ))}
              </NativeSelect>
            </label>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button type="submit">Create Draft</Button>
          <Button asChild variant="outline">
            <Link href="/app/assignments">Cancel</Link>
          </Button>
        </div>
      </form>
    </main>
  );
}
