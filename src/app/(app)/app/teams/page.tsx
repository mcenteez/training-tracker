import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import { hasPermission } from "@/modules/access-control/permissions";
import {
  listTeamMembershipsForUserInOrganization,
  listTeamsByIdsInOrganization,
  listTeamsByOrganizationId,
} from "@/modules/teams/db/queries";

interface TeamOperationsPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function TeamOperationsPage({
  searchParams,
}: TeamOperationsPageProps) {
  const context = await loadActiveAppContext();
  const feedback = await searchParams;
  const organizationId = context.membership.organizationId;
  const teamMemberships = await withDatabase((database) =>
    listTeamMembershipsForUserInOrganization(database, {
      organizationId,
      userId: context.user.id,
    }),
  );
  const canManageOrganizationTeams = hasPermission(
    { organizationRole: context.membership.organizationRole },
    "team.update",
  );
  const managedTeamIds = teamMemberships
    .filter(
      (membership) =>
        membership.teamRole === "manager" &&
        hasPermission(
          {
            organizationRole: context.membership.organizationRole,
            teamRole: membership.teamRole,
          },
          "team.update",
        ),
    )
    .map((membership) => membership.teamId);

  if (!canManageOrganizationTeams && managedTeamIds.length === 0) {
    redirect("/app");
  }

  const teams = await withDatabase((database) =>
    canManageOrganizationTeams
      ? listTeamsByOrganizationId(database, organizationId)
      : listTeamsByIdsInOrganization(database, {
          organizationId,
          teamIds: managedTeamIds,
        }),
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">Team Management</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {context.membership.organizationName}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage settings and rosters for teams within your scope.
        </p>
      </section>

      {feedback.error === "invalid_team_input" ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The submitted team settings were invalid.
        </p>
      ) : null}

      {teams.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No managed teams</CardTitle>
            <CardDescription>
              Teams will appear here when management access is assigned.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader>
                <CardTitle>{team.name}</CardTitle>
                <CardDescription>Team settings and roster</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/app/teams/${team.id}`}>Manage team</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/app/performance/teams/${team.id}`}>
                    View performance
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </main>
  );
}
